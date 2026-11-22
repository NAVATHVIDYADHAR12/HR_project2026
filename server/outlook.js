import { db } from './db.js'

// Outlook / Microsoft 365 through Microsoft Graph, with the OAuth device-code sign-in:
// the user enters a short code on Microsoft's own page; we only ever hold tokens, never a password.
// Needs a one-time free app registration (Client ID) — see the guide in Mail Drop → Send settings.

export const MS = { login: 'https://login.microsoftonline.com', graph: 'https://graph.microsoft.com/v1.0' }
const SCOPES = 'offline_access User.Read Mail.Send Mail.ReadWrite'
const KEY = 'msmail'

const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
const setSetting = (k, v) => v == null ? db.prepare('DELETE FROM settings WHERE key = ?').run(k)
  : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
const load = () => JSON.parse(getSetting(KEY) || '{}')
const store = (v) => setSetting(KEY, JSON.stringify(v))
const err = (status, message) => Object.assign(new Error(message), { status })

export function msStatus() {
  const s = load()
  return { clientId: s.clientId || '', tenant: s.tenant || 'common', connected: !!s.refreshToken, account: s.account || null, pending: !!getPending() }
}
export const mailMethod = () => getSetting('mailMethod') || 'smtp'
export const setMailMethod = (m) => setSetting('mailMethod', m === 'microsoft' ? 'microsoft' : 'smtp')

async function form(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
const friendly = (j) => {
  const d = `${j.error || ''} ${j.error_description || ''}`
  // 50059 is what "common" returns for a Client ID that doesn't exist anywhere.
  if (/AADSTS700016|AADSTS50059|application.*not found/i.test(d)) return 'Microsoft doesn’t know that Client ID. Copy the “Application (client) ID” from your app registration (and check it allows any organizational directory and personal accounts).'
  if (/AADSTS7000218|client_assertion|client_secret/i.test(d)) return 'Turn on “Allow public client flows” in your app registration (Authentication → Advanced settings), then try again.'
  if (/AADSTS65001|consent/i.test(d)) return 'Your organisation needs an admin to approve this app (API permissions → Grant admin consent).'
  if (/AADSTS50020|AADSTS50194/i.test(d)) return 'This app registration doesn’t allow your account type. Choose “any organizational directory and personal Microsoft accounts”, or pick the matching account type here.'
  return (j.error_description || j.error || 'Microsoft sign-in failed').split('\r\n')[0].slice(0, 220)
}

// The waiting sign-in lives in the database, so a server restart mid-sign-in doesn't lose the user's approval.
const getPending = () => JSON.parse(getSetting('msPending') || 'null') // { deviceCode, clientId, tenant, interval, expiresAt }
const setPending = (v) => setSetting('msPending', v ? JSON.stringify(v) : null)

/** Step 1: get a code for the user to enter at microsoft.com/devicelogin. */
export async function msStart(clientId, tenant = 'common') {
  clientId = String(clientId || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw err(400, 'Paste the “Application (client) ID” (looks like 1a2b3c4d-…, 36 characters).')
  tenant = ['common', 'organizations', 'consumers'].includes(tenant) ? tenant : 'common'
  const { status, json } = await form(`${MS.login}/${tenant}/oauth2/v2.0/devicecode`, { client_id: clientId, scope: SCOPES })
  if (status !== 200) throw err(400, friendly(json))
  setPending({ deviceCode: json.device_code, clientId, tenant, interval: json.interval || 5, expiresAt: Date.now() + (json.expires_in || 900) * 1000 })
  store({ ...load(), clientId, tenant })
  return { userCode: json.user_code, verificationUri: json.verification_uri || 'https://microsoft.com/devicelogin', interval: json.interval || 5, expiresIn: json.expires_in }
}

/** Step 2: the page polls this until the user has approved. */
export async function msPoll() {
  const pending = getPending()
  if (!pending) return msStatus().connected ? { status: 'connected', account: load().account } : { status: 'idle' }
  if (Date.now() > pending.expiresAt) { setPending(null); throw err(410, 'The code expired. Click Sign in with Microsoft again.') }
  const { status, json } = await form(`${MS.login}/${pending.tenant}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: pending.clientId, device_code: pending.deviceCode })
  if (status !== 200) {
    if (json.error === 'authorization_pending' || json.error === 'slow_down') return { status: 'pending' }
    setPending(null)
    if (json.error === 'authorization_declined') throw err(400, 'Sign-in was cancelled on Microsoft’s page.')
    throw err(400, friendly(json))
  }
  setPending(null)
  saveTokens(json)
  const me = await graph('GET', '/me')
  const account = { name: me.displayName || '', email: me.mail || me.userPrincipalName || '' }
  store({ ...load(), account })
  setMailMethod('microsoft')
  return { status: 'connected', account }
}

function saveTokens(j) {
  store({ ...load(), accessToken: j.access_token, refreshToken: j.refresh_token || load().refreshToken, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 })
}

async function token() {
  const s = load()
  if (!s.refreshToken) throw err(400, 'Sign in with Microsoft first (Mail Drop → Send settings).')
  if (s.accessToken && s.expiresAt - Date.now() > 120000) return s.accessToken
  const { status, json } = await form(`${MS.login}/${s.tenant || 'common'}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: SCOPES })
  if (status !== 200) { store({ clientId: s.clientId, tenant: s.tenant }); throw err(401, 'Your Microsoft sign-in has expired. Sign in again.') }
  saveTokens(json)
  return json.access_token
}

export async function graph(method, path, body) {
  const res = await fetch(MS.graph + path, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) })
  if (res.status === 202 || res.status === 204) return {}
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const m = j.error?.message || res.statusText
    if (res.status === 401) throw err(401, 'Microsoft refused the sign-in. Sign in again.')
    if (res.status === 403) throw err(403, `Your account isn’t allowed to do this (${m}). An admin may need to grant consent.`)
    throw err(res.status, `Outlook: ${m}`)
  }
  return j
}

const msg = (m) => ({ subject: m.subject, body: { contentType: 'Text', content: m.body }, toRecipients: [{ emailAddress: { address: m.email, name: m.name || m.email } }] })
/** Same interface sendAll uses for SMTP: sendMail({ _m }) */
export const graphTransport = () => ({ sendMail: ({ _m }) => graph('POST', '/me/sendMail', { message: msg(_m), saveToSentItems: true }) })
/** Real drafts in the user's Outlook Drafts folder. */
export async function msDrafts(messages) {
  const out = []
  for (const m of messages) {
    try { const d = await graph('POST', '/me/messages', msg(m)); out.push({ ...m, ok: true, link: d.webLink }) }
    catch (e) { out.push({ ...m, ok: false, error: e.message }); if (e.status === 401) break }
  }
  return out
}
export function msDisconnect() {
  const s = load()
  setPending(null)
  store({ clientId: s.clientId, tenant: s.tenant })
  if (mailMethod() === 'microsoft') setMailMethod('smtp')
  return msStatus()
}
