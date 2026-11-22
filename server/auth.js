import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { db } from './db.js'

// Accounts + sessions. Passwords: scrypt with a per-user salt. Sessions: random token in an HttpOnly cookie,
// only its SHA-256 is stored, so a copied database can't be used to log in.

const DAY = 864e5
export const SESSION_DAYS = 30
export const COOKIE = 'td_session'
const sha = (s) => createHash('sha256').update(s).digest('hex')

export function hashPassword(pw) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 64).toString('hex')}`
}
export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$')
  if (!salt || !hash) return false
  const a = scryptSync(pw, Buffer.from(salt, 'hex'), 64), b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

const err = (status, message) => Object.assign(new Error(message), { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export function validateSignup({ name, email, password }) {
  name = String(name || '').trim(); email = String(email || '').trim().toLowerCase(); password = String(password || '')
  if (name.length < 2) throw err(400, 'Please enter your name.')
  if (!EMAIL.test(email)) throw err(400, 'Please enter a valid email address.')
  if (password.length < 8) throw err(400, 'Use at least 8 characters for your password.')
  if (/^(.)\1+$/.test(password) || /^(password|12345678|qwertyui)/i.test(password)) throw err(400, 'That password is too easy to guess.')
  return { name: name.slice(0, 80), email: email.slice(0, 200), password }
}

export function signup(input) {
  const { name, email, password } = validateSignup(input)
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw err(409, 'An account with this email already exists. Log in instead.')
  const id = Number(db.prepare('INSERT INTO users (name, email, passHash) VALUES (?, ?, ?)').run(name, email, hashPassword(password)).lastInsertRowid)
  return { user: publicUser(id), token: newSession(id) }
}

// Simple brute-force guard: 8 wrong passwords per email in 15 minutes locks that email for the rest of the window.
const attempts = new Map()
export function login({ email, password }, now = Date.now()) {
  email = String(email || '').trim().toLowerCase()
  const a = attempts.get(email)
  if (a && now - a.first < 15 * 60e3 && a.n >= 8) throw err(429, 'Too many wrong passwords. Wait 15 minutes and try again.')
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!u || !verifyPassword(String(password || ''), u.passHash)) {
    const cur = a && now - a.first < 15 * 60e3 ? a : { n: 0, first: now }
    attempts.set(email, { ...cur, n: cur.n + 1 })
    throw err(401, 'Email or password is wrong.')
  }
  attempts.delete(email)
  return { user: publicUser(u.id), token: newSession(u.id) }
}

// Hosted demo (Vercel): server copies come and go, each with its own temporary database, so a session stored in
// one is unknown to the next and people get logged out at random. There the token itself is signed instead.
export const HOSTED = process.env.TD_DEMO === '1' || (!!process.env.VERCEL && process.env.TD_DEMO !== '0')
// shortcut: without TD_SECRET the key is per server copy (sessions then last only as long as that copy); set it on Vercel.
const SECRET = process.env.TD_SECRET || randomBytes(32).toString('hex')
const sign = (s) => createHmac('sha256', SECRET).update(s).digest('base64url')
function signedToken(userId) {
  const { email } = db.prepare('SELECT email FROM users WHERE id = ?').get(userId)
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * DAY })).toString('base64url')
  return `v1.${body}.${sign(body)}`
}
function signedUser(token) {
  const [, body, sig] = token.split('.')
  if (!body || !sig) return null
  const good = Buffer.from(sign(body)), got = Buffer.from(sig)
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null
  const { e, x } = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (!(x > Date.now())) return null
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(e)
  return u ? publicUser(u.id) : null
}

function newSession(userId) {
  if (HOSTED) return signedToken(userId)
  const token = randomBytes(32).toString('base64url')
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(new Date().toISOString())
  db.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').run(sha(token), userId, new Date(Date.now() + SESSION_DAYS * DAY).toISOString())
  return token
}
export function userForToken(token) {
  if (!token) return null
  if (HOSTED && token.startsWith('v1.')) return signedUser(token)
  const s = db.prepare('SELECT userId, expiresAt FROM sessions WHERE tokenHash = ?').get(sha(token))
  if (!s || s.expiresAt < new Date().toISOString()) return null
  return publicUser(s.userId)
}
export const logout = (token) => token && db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(sha(token))
export const publicUser = (id) => db.prepare('SELECT id, name, email, createdAt FROM users WHERE id = ?').get(id) || null
export const hasUsers = () => !!db.prepare('SELECT 1 FROM users LIMIT 1').get()

// The Chrome extension can't share the browser login cookie, so it uses a key shown in Settings.
export function extensionKey() {
  let k = db.prepare("SELECT value FROM settings WHERE key = 'extensionKey'").get()?.value
  if (!k) { k = 'tdx_' + randomBytes(18).toString('base64url'); db.prepare("INSERT INTO settings (key, value) VALUES ('extensionKey', ?)").run(k) }
  return k
}
export function rotateExtensionKey() {
  db.prepare("DELETE FROM settings WHERE key = 'extensionKey'").run()
  return extensionKey()
}
export function validExtensionKey(k) {
  const real = extensionKey()
  return typeof k === 'string' && k.length === real.length && timingSafeEqual(Buffer.from(k), Buffer.from(real))
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return ''
}
const SECURE = process.env.VERCEL ? '; Secure' : '' // https only on the hosted site
export const sessionCookie = (token) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${SECURE}`
export const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
