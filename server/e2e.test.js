// End-to-end: a real server on a spare port with an empty temp database, driven through the HTTP API
// the way the app and extension use it. Offline only (AI paths are covered live, not here).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('..', import.meta.url))
const PORT = 5299
const B = `http://127.0.0.1:${PORT}/api`
let server

test.before(async () => {
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), TD_DB: join(tmpdir(), `td-e2e-${Date.now()}.db`) }, stdio: 'pipe' })
  // Up to 30 s: with every test file running at once the server can start slowly.
  for (let i = 0; i < 150; i++) { try { if ((await realFetch(`${B}/health`)).ok) return } catch {} await new Promise((r) => setTimeout(r, 200)) }
  throw new Error('server did not start')
})
test.after(() => server?.kill())

// Logged-in cookie, set by the accounts test below and sent with every later request (like the browser does).
let cookie = ''
const realFetch = globalThis.fetch
globalThis.fetch = (url, opts = {}) => realFetch(url, { ...opts, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } })
const json = (path, body, method = 'POST', headers = {}) => fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json(), setCookie: r.headers.get('set-cookie') }))

test('accounts: API locked until sign up; rules for passwords, duplicates, login, logout, extension key', async () => {
  assert.equal((await json('/candidates', null, 'GET')).status, 401)
  assert.equal((await json('/auth/me', null, 'GET')).body.hasUsers, false)
  assert.match((await json('/auth/signup', { name: 'Priya', email: 'priya@agency.in', password: 'short' })).body.error, /8 characters/)
  const s = await json('/auth/signup', { name: 'Priya', email: 'Priya@Agency.in', password: 'Recruit@2026' })
  assert.equal(s.status, 201)
  assert.match(s.setCookie, /td_session=.+HttpOnly/)
  assert.equal((await json('/auth/signup', { name: 'P2', email: 'priya@agency.in', password: 'Another#2026' })).status, 409)
  assert.equal((await json('/auth/login', { email: 'priya@agency.in', password: 'wrong-password' })).status, 401)
  const l = await json('/auth/login', { email: 'PRIYA@agency.in', password: 'Recruit@2026' })
  assert.equal(l.body.user.name, 'Priya')
  cookie = l.setCookie.split(';')[0]
  assert.equal((await json('/auth/me', null, 'GET')).body.user.email, 'priya@agency.in')
  // The extension works with its key and no cookie
  const key = (await json('/auth/extension-key', null, 'GET')).body.key
  const saved = cookie; cookie = ''
  assert.equal((await json('/extension/score', { jd: 'java', cards: [{ text: 'java 5y' }] }, 'POST', { 'X-TD-Key': key })).status, 200)
  assert.equal((await json('/extension/score', { jd: 'java', cards: [{ text: 'java' }] }, 'POST', { 'X-TD-Key': 'tdx_wrong' })).status, 401)
  // Logging out kills that session
  cookie = saved
  const temp = (await json('/auth/login', { email: 'priya@agency.in', password: 'Recruit@2026' })).setCookie.split(';')[0]
  cookie = temp; await json('/auth/logout', {})
  assert.equal((await json('/candidates', null, 'GET')).status, 401)
  cookie = saved
})
const sample = (f) => new Blob([readFileSync(join(root, 'samples', f))])
const xlsx = async (res) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer())); return wb }

test('F1 resume matcher: TXT + PDF + DOCX, three buckets, Excel export', async () => {
  const fd = new FormData()
  fd.append('jdFile', sample('JD_java_developer.txt'), 'JD_java_developer.txt')
  for (const f of ['rahul_sharma.txt', 'priya_nair.txt', 'meera_iyer.pdf', 'vikram_singh.docx']) fd.append('resumes', sample(f), f)
  fd.append('resumes', new Blob(['x']), 'photo.png')
  const r = await (await fetch(`${B}/match`, { method: 'POST', body: fd })).json()
  assert.deepEqual(r.results.map((x) => [x.name, x.bucket]), [['Rahul Sharma', 'strong'], ['Meera Iyer', 'strong'], ['Vikram Singh', 'moderate'], ['Priya Nair', 'weak']])
  assert.equal(r.failed[0].filename, 'photo.png')
  const wb = await xlsx(await fetch(`${B}/export/match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: r.results }) }))
  assert.deepEqual(wb.worksheets.map((w) => w.rowCount), [3, 2, 2])
})

test('F2 extension scoring with filters', async () => {
  const r = await json('/extension/score', { jd: 'Java 4-7 years: Java, Spring Boot, Kafka', filters: { maxNotice: 30 }, cards: [
    { name: 'A', text: 'Java Spring Boot Kafka 5y Notice: 15 days' }, { name: 'B', text: 'Java 5y Notice: 90 days' },
  ] })
  assert.deepEqual(r.body.results.map((x) => x.pass), [true, false])
})

test('F6 memory: parse → questions → save → update (no duplicate) → history', async () => {
  const p = await json('/memory/parse', { text: 'Rahul Sharma selected for Infosys Java Developer, notice 30 days, expected 16 LPA, PAN ABCDE1234F. Anita Verma rejected by TCS due to weak communication.' })
  assert.deepEqual(p.body.items.map((i) => [i.fields.name, i.fields.status, i.fields.email]), [['Rahul Sharma', 'selected', 'rahul.sharma@gmail.com'], ['Anita Verma', 'rejected', undefined]])
  const s = await json('/memory/save', { items: p.body.items.map((i) => ({ fields: i.fields, matchId: i.matchId })), note: 'n' })
  assert.equal(s.body.ids.length, 2)
  const p2 = await json('/memory/parse', { text: 'rahul sharma rejected by Infosys due to BGV' })
  assert.ok(p2.body.items[0].matchId)
  assert.ok(p2.body.items[0].questions.some((q) => q.kind === 'confirm'))
  await json('/memory/save', { items: [{ fields: p2.body.items[0].fields, matchId: p2.body.items[0].matchId }] })
  const list = (await (await fetch(`${B}/candidates`)).json()).candidates
  assert.equal(list.length, 2)
  const rahul = await (await fetch(`${B}/candidates/${list.find((c) => c.name === 'Rahul Sharma').id}`)).json()
  assert.equal(rahul.status, 'rejected')
  assert.equal(rahul.pan, 'ABCDE****F')
  assert.equal(rahul.events.length, 2)
  assert.equal((await json('/memory/save', { items: [{ fields: { name: 'X' }, matchId: null }] })).status, 400)
})

test('F7 ask memory + F8 tracker export', async () => {
  assert.match((await json('/ask', { q: 'how many rejected till now' })).body.text, /^2 candidates/)
  const why = await json('/ask', { q: 'who was rejected for TCS and why' })
  assert.equal(why.body.rows[0].evReason, 'weak communication')
  assert.equal((await json('/ask', { q: 'selected candidates' })).body.count, 0, 'Rahul is no longer selected')
  assert.equal((await json('/ask', { q: 'selected for Infosys' })).body.count, 1, 'but history remembers he was')
  await json('/tracker/format', { type: 'columns', columns: [{ header: 'Name', field: 'name' }, { header: 'PAN', field: 'pan' }, { header: 'Remarks', field: 'reason' }] })
  const wb = await xlsx(await fetch(`${B}/tracker/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'rejected tracker' }) }))
  const rows = []; wb.worksheets[0].eachRow((r) => rows.push(r.values.slice(1)))
  assert.deepEqual(rows[0], ['Name', 'PAN', 'Remarks'])
  assert.ok(rows.some((r) => r[1] === 'ABCDE1234F'), 'full PAN in your own tracker')
})

test('F10 mail drop: template, JD, recipients, preview, drafts, send needs confirm + account', async () => {
  const t = await json('/mail/templates', { name: 'First touch', subject: '{role} at {company}', body: 'Hi {firstName}, a {role} role in {location}.' })
  assert.ok(t.body.id)
  const d = (await json('/mail/jd', { jd: 'Role: Java Developer\nClient: Wipro\nLocation: Pune\nJava, Spring Boot' })).body.details
  const rec = (await json('/mail/recipients', { text: 'Rahul Sharma, nobody here' })).body.recipients
  assert.deepEqual(rec.map((r) => r.status), ['ok', 'notfound'])
  const msgs = (await json('/mail/preview', { subject: '{role} at {company}', body: 'Hi {firstName}, a {role} role in {location}.', details: d, recipients: rec.filter((r) => r.status === 'ok') })).body.messages
  assert.equal(msgs[0].body, 'Hi Rahul, a Java Developer role in Pune.')
  const zip = await JSZip.loadAsync(Buffer.from(await (await fetch(`${B}/mail/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }) })).arrayBuffer()))
  assert.deepEqual(Object.keys(zip.files), ['Rahul Sharma.eml'])
  assert.equal((await json('/mail/send', { messages: msgs })).status, 400, 'no confirm, no send')
  assert.match((await json('/mail/send', { confirm: true, messages: msgs })).body.error, /Set up your email account/)
})

test('F3 poster copy + F4 LinkedIn groups', async () => {
  const c = (await json('/poster/copy', { jd: 'Senior Java Developer - Hyderabad\nExperience: 4-7 years\nJava, Kafka', contact: 'hr@x.in' })).body
  assert.match(c.copy.caption, /Share your CV: hr@x\.in/)
  await json('/linkedin/import', { text: 'Java Jobs India | https://www.linkedin.com/groups/101/ | 300K\nCooking Club | https://www.linkedin.com/groups/102/ | 2M' })
  await json('/linkedin/limit', { limit: 1 })
  const r = (await json('/linkedin/rank', { jd: 'Java developer', count: 5 })).body
  assert.deepEqual(r.picks.map((g) => g.name), ['Java Jobs India'])
  assert.equal((await json('/linkedin/posted', { groupId: r.picks[0].id })).body.usage.left, 0)
  assert.equal((await json('/linkedin/posted', { groupId: r.picks[0].id })).status, 409)
})

test('new: extension zip, list export in Word/PDF, help bot, Outlook + LinkedIn status', async () => {
  const z = await JSZip.loadAsync(Buffer.from(await (await fetch(`${B}/extension/download`)).arrayBuffer()))
  assert.ok(z.file('talentdesk-extension/manifest.json') && z.file('talentdesk-extension/content.js'))
  assert.match(await z.file('talentdesk-extension/popup.html').async('string'), /Start screening/)
  const docx = await fetch(`${B}/tracker/export-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', format: 'docx' }) })
  assert.match(docx.headers.get('content-disposition'), /\.docx"/)
  const pdf = await fetch(`${B}/tracker/export-list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'pdf' }) })
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
  const ask = await fetch(`${B}/tracker/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'rejected tracker in pdf', format: 'pdf' }) })
  assert.match(ask.headers.get('content-disposition'), /\.pdf"/)
  const hi = await json('/help', { message: 'hi' })
  assert.match(hi.body.reply, /^Hi Priya!/)
  assert.match((await json('/help', { message: 'how many rejected?' })).body.reply, /candidate/)
  const saved = cookie; cookie = ''
  const anon = await json('/help', { message: 'how many rejected?' })
  assert.doesNotMatch(anon.body.reply, /Anita/, 'no data for logged-out visitors')
  cookie = saved
  assert.equal((await json('/mail/outlook', null, 'GET')).body.connected, false)
  assert.equal((await json('/linkedin/api', null, 'GET')).body.redirectUri, `http://localhost:${PORT}/api/linkedin/oauth/callback`)
  assert.equal((await json('/linkedin/api/post', { text: 'x' })).status, 400, 'no confirm, no post')
  assert.equal((await fetch(`${B}/linkedin/oauth/callback?code=x&state=forged`, { redirect: 'manual' })).status, 302)
})

test('security + backup', async () => {
  assert.equal((await json('/memory/save', { items: [] }, 'POST', { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await fetch(`${B}/ai/config`, { headers: { Origin: 'http://localhost:5173' } })).status, 200)
  assert.equal((await fetch(`${B}/nope`)).status, 404)
  const cfg = await (await fetch(`${B}/ai/config`)).json()
  assert.ok(!JSON.stringify(cfg).match(/"key"/), 'API keys never sent to the browser')
  const b = await fetch(`${B}/backup`)
  assert.equal(b.status, 200)
  assert.equal(Buffer.from(await b.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3')
})
