import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-ms-test-${process.pid}-${Date.now()}.db`)
const o = await import('./outlook.js')
const mail = await import('./mail.js')

// Stand-in for login.microsoftonline.com + graph.microsoft.com
const CLIENT = '11111111-2222-3333-4444-555555555555'
let polls = 0, refreshed = 0
const sent = [], drafts = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d)).on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
    const f = Object.fromEntries(new URLSearchParams(body))
    if (req.url.endsWith('/devicecode')) return f.client_id === CLIENT ? send(200, { device_code: 'DC', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', interval: 1, expires_in: 900 }) : send(400, { error: 'unauthorized_client', error_description: 'AADSTS700016: Application not found' })
    if (req.url.endsWith('/token') && f.grant_type.includes('device_code')) return ++polls < 2 ? send(400, { error: 'authorization_pending' }) : send(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 1 })
    if (req.url.endsWith('/token') && f.grant_type === 'refresh_token') { refreshed++; return send(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 }) }
    if (!/^Bearer AT[12]$/.test(req.headers.authorization || '')) return send(401, { error: { message: 'bad token' } })
    if (req.url === '/me') return send(200, { displayName: 'Priya Nair', mail: 'priya@agency.com' })
    if (req.url === '/me/sendMail') { sent.push(JSON.parse(body)); return send(202) }
    if (req.url === '/me/messages') { drafts.push(JSON.parse(body)); return send(201, { id: 'd1', webLink: 'https://outlook.office.com/d1' }) }
    send(404, { error: { message: 'nope' } })
  })
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
o.MS.login = base; o.MS.graph = base
test.after(() => server.close())

test('wrong client id gets a plain-English error', async () => {
  await assert.rejects(o.msStart('not-a-guid'), /Application \(client\) ID/)
  await assert.rejects(o.msStart('99999999-2222-3333-4444-555555555555'), /doesn’t know that Client ID/)
})

test('device code sign-in: code, pending, connected, account read, method switched to Outlook', async () => {
  const s = await o.msStart(CLIENT, 'common')
  assert.equal(s.userCode, 'ABCD-EFGH')
  assert.equal((await o.msPoll()).status, 'pending')
  const done = await o.msPoll()
  assert.equal(done.status, 'connected')
  assert.deepEqual(done.account, { name: 'Priya Nair', email: 'priya@agency.com' })
  assert.equal(o.mailMethod(), 'microsoft')
  assert.equal(o.msStatus().connected, true)
})

test('sending goes through Outlook, refreshing the expired token first', async () => {
  const r = await mail.sendAll([{ name: 'Rahul Sharma', email: 'rahul@x.com', subject: 'Java role', body: 'Hi Rahul' }, { email: 'bad', subject: 's', body: 'b' }], { gapMs: 0 })
  assert.deepEqual(r.map((x) => x.ok), [true, false])
  assert.equal(refreshed, 1, 'access token had expired, refreshed once')
  assert.deepEqual(sent[0].message.toRecipients, [{ emailAddress: { address: 'rahul@x.com', name: 'Rahul Sharma' } }])
  assert.equal(sent[0].saveToSentItems, true)
  assert.equal(mail.mailLog()[0].method, 'outlook')
})

test('drafts land in Outlook Drafts with a link', async () => {
  const r = await o.msDrafts([{ name: 'Anita', email: 'anita@x.com', subject: 'Opening', body: 'Hi' }])
  assert.equal(r[0].link, 'https://outlook.office.com/d1')
  assert.equal(drafts[0].subject, 'Opening')
})

test('disconnect forgets tokens and falls back to SMTP', () => {
  const s = o.msDisconnect()
  assert.equal(s.connected, false)
  assert.equal(s.clientId, CLIENT, 'client id kept for next sign-in')
  assert.equal(o.mailMethod(), 'smtp')
})
