import { randomBytes } from 'node:crypto'
import { db } from './db.js'

// LinkedIn's official API (OAuth 2.0 "Sign In with LinkedIn" + "Share on LinkedIn"): post a poster + caption
// to the member's own feed. LinkedIn offers no group-posting API outside approved partners, so groups stay assisted.

export const LI = { auth: 'https://www.linkedin.com/oauth/v2', api: 'https://api.linkedin.com' }
const SCOPES = 'openid profile email w_member_social'
const KEY = 'liapi'

const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
const load = () => JSON.parse(getSetting(KEY) || '{}')
const store = (v) => setSetting(KEY, JSON.stringify(v))
const err = (status, message) => Object.assign(new Error(message), { status })

export function liStatus(redirectUri) {
  const s = load()
  const expired = s.expiresAt && s.expiresAt < Date.now()
  return { clientId: s.clientId || '', hasSecret: !!s.clientSecret, connected: !!s.accessToken && !expired, expired: !!expired, person: s.person || null, expiresAt: s.expiresAt || null, redirectUri }
}
// LinkedIn Client IDs are short letter/number codes (e.g. 86abc12xyz3456); an email here means the login got pasted/autofilled.
const BAD_ID = 'That isn’t a LinkedIn Client ID. Use the “Client ID” from your app at linkedin.com/developers → Auth (a short code like 86abc12xyz3456), not your LinkedIn email or password.'
const validId = (id) => /^[A-Za-z0-9]{8,40}$/.test(id)
export function liConfig({ clientId, clientSecret }) {
  const s = load()
  if (clientId !== undefined) {
    const id = String(clientId).trim()
    if (id && !validId(id)) throw err(400, BAD_ID)
    s.clientId = id
  }
  if (clientSecret) s.clientSecret = String(clientSecret).trim()
  store(s)
}

const states = new Map() // state -> { returnTo, at }
/** Step 1: the LinkedIn consent URL. */
export function liAuthUrl(redirectUri, returnTo) {
  const s = load()
  if (!s.clientId || !s.clientSecret) throw err(400, 'Add your LinkedIn app’s Client ID and Client Secret first.')
  if (!validId(s.clientId)) throw err(400, BAD_ID)
  const state = randomBytes(16).toString('hex')
  states.set(state, { returnTo, at: Date.now() })
  return `${LI.auth}/authorization?${new URLSearchParams({ response_type: 'code', client_id: s.clientId, redirect_uri: redirectUri, state, scope: SCOPES })}`
}

/** Step 2: LinkedIn redirects back with ?code&state. */
export async function liCallback({ code, state, error, error_description }, redirectUri) {
  const st = states.get(state)
  states.delete(state)
  if (!st || Date.now() - st.at > 15 * 60e3) throw err(400, 'This LinkedIn sign-in link expired or was not started here. Click Connect LinkedIn again.')
  if (error) throw Object.assign(err(400, error === 'user_cancelled_authorize' ? 'You cancelled on LinkedIn.' : `LinkedIn said: ${error_description || error}`), { returnTo: st.returnTo })
  const s = load()
  const res = await fetch(`${LI.auth}/accessToken`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: s.clientId, client_secret: s.clientSecret }), signal: AbortSignal.timeout(20000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(err(400, `LinkedIn sign-in failed: ${j.error_description || j.error || res.status}. Check the Client Secret and that the redirect URL matches exactly.`), { returnTo: st.returnTo })
  const me = await fetch(`${LI.api}/v2/userinfo`, { headers: { Authorization: `Bearer ${j.access_token}` } }).then((r) => r.json())
  store({ ...s, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 5184000) * 1000, person: { sub: me.sub, name: me.name || '', email: me.email || '', picture: me.picture || '' } })
  return st.returnTo
}

export function liDisconnect() { const s = load(); store({ clientId: s.clientId, clientSecret: s.clientSecret }) }

// LinkedIn's REST API needs a "LinkedIn-Version: YYYYMM" header and retires old versions after about a year.
// Start at last month and step back until LinkedIn accepts one; remember the one that works.
const months = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
async function rest(method, path, body) {
  const s = load()
  if (!s.accessToken || s.expiresAt < Date.now()) throw err(401, 'Connect LinkedIn first (your access lasts 60 days, then reconnect).')
  const tried = [getSetting('liVersion'), ...Array.from({ length: 12 }, (_, i) => months(i + 1))].filter(Boolean)
  for (const v of [...new Set(tried)]) {
    const res = await fetch(LI.api + path, { method, headers: { Authorization: `Bearer ${s.accessToken}`, 'LinkedIn-Version': v, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(30000) })
    const text = await res.text()
    const j = (() => { try { return JSON.parse(text) } catch { return {} } })()
    if (res.status === 426 || /NONEXISTENT_VERSION|VERSION_MISSING|not active/i.test(j.code || j.message || '')) continue
    if (res.status === 401) throw err(401, 'LinkedIn access has expired or was revoked. Connect LinkedIn again.')
    if (res.status === 403) throw err(403, 'LinkedIn refused: your app needs the “Share on LinkedIn” product (w_member_social). Add it in the LinkedIn developer portal.')
    if (!res.ok) throw err(res.status, `LinkedIn: ${j.message || res.statusText}`)
    setSetting('liVersion', v)
    return { json: j, headers: res.headers }
  }
  throw err(502, 'LinkedIn did not accept any recent API version. Try again later.')
}

// LinkedIn "little text": reserved characters must be escaped; #Words become real hashtags.
export function littleText(text) {
  return String(text).replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`)
    .replace(/#([A-Za-z][\w]*)/g, (_, w) => `{hashtag|\\#|${w}}`)
}

/** Publish to the member's feed, with an optional poster image (data URL). */
export async function liPost(text, imageDataUrl) {
  const s = load()
  const author = `urn:li:person:${s.person?.sub}`
  if (!String(text || '').trim()) throw err(400, 'Write a caption first.')
  let media
  if (imageDataUrl) {
    const m = String(imageDataUrl).match(/^data:image\/(png|jpe?g);base64,(.+)$/)
    if (!m) throw err(400, 'The poster must be a PNG or JPG image.')
    const init = await rest('POST', '/rest/images?action=initializeUpload', { initializeUploadRequest: { owner: author } })
    const up = await fetch(init.json.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(m[2], 'base64'), signal: AbortSignal.timeout(60000) })
    if (!up.ok) throw err(502, `LinkedIn image upload failed (${up.status}).`)
    media = { id: init.json.value.image, altText: 'Hiring poster' }
  }
  const r = await rest('POST', '/rest/posts', {
    author, commentary: littleText(text), visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(media ? { content: { media } } : {}),
    lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
  })
  const urn = r.headers.get('x-restli-id') || ''
  return { urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/feed/' }
}
