import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-liapi-test-${process.pid}-${Date.now()}.db`)
const li = await import('./linkedin-api.js')

// Stand-in for www.linkedin.com (oauth) + api.linkedin.com
const seen = { posts: [], uploads: [], versions: [] }
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (d) => chunks.push(d)).on('end', () => {
    const body = Buffer.concat(chunks)
    const send = (code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(obj ? JSON.stringify(obj) : '') }
    if (req.url === '/accessToken') {
      const f = Object.fromEntries(new URLSearchParams(body.toString()))
      return f.code === 'GOOD' && f.client_secret === 'SECRET' ? send(200, { access_token: 'LIAT', expires_in: 5184000 }) : send(400, { error: 'invalid_request', error_description: 'bad code' })
    }
    if (req.headers.authorization !== 'Bearer LIAT') return send(401, { message: 'unauthorized' })
    if (req.url === '/v2/userinfo') return send(200, { sub: 'abc123', name: 'Priya Nair', email: 'priya@agency.com' })
    if (req.url.startsWith('/rest/')) {
      seen.versions.push(req.headers['linkedin-version'])
      // Pretend only versions two or more months old are active
      if (seen.versions.length === 1) return send(426, { code: 'NONEXISTENT_VERSION', message: 'Requested version is not active' })
    }
    if (req.url === '/rest/images?action=initializeUpload') return send(200, { value: { uploadUrl: `http://127.0.0.1:${server.address().port}/upload/1`, image: 'urn:li:image:IMG1' } })
    if (req.url === '/upload/1') { seen.uploads.push(body.length); return send(201) }
    if (req.url === '/rest/posts') { seen.posts.push(JSON.parse(body.toString())); return send(201, null, { 'x-restli-id': 'urn:li:share:999' }) }
    send(404, { message: 'nope' })
  })
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
li.LI.auth = base; li.LI.api = base
test.after(() => server.close())
const REDIRECT = 'http://localhost:5174/api/linkedin/oauth/callback'

test('needs app keys first; consent URL has the right scopes and a state', () => {
  assert.throws(() => li.liAuthUrl(REDIRECT, 'http://localhost:5173'), /Client ID and Client Secret/)
  assert.throws(() => li.liConfig({ clientId: 'me@gmail.com', clientSecret: 'x' }), /isn’t a LinkedIn Client ID/)
  li.liConfig({ clientId: '86abc12xyz3456', clientSecret: 'SECRET' })
  const url = new URL(li.liAuthUrl(REDIRECT, 'http://localhost:5173'))
  assert.equal(url.searchParams.get('client_id'), '86abc12xyz3456')
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT)
  assert.match(url.searchParams.get('scope'), /w_member_social/)
  assert.ok(url.searchParams.get('state').length >= 32)
  assert.equal(li.liStatus(REDIRECT).hasSecret, true)
  assert.ok(!JSON.stringify(li.liStatus(REDIRECT)).includes('SECRET'), 'secret never returned')
})

test('callback: forged state rejected; good code connects and reads the profile', async () => {
  await assert.rejects(li.liCallback({ code: 'GOOD', state: 'forged' }, REDIRECT), /expired or was not started here/)
  const state = new URL(li.liAuthUrl(REDIRECT, 'http://localhost:5173')).searchParams.get('state')
  assert.equal(await li.liCallback({ code: 'GOOD', state }, REDIRECT), 'http://localhost:5173')
  const st = li.liStatus(REDIRECT)
  assert.equal(st.connected, true)
  assert.equal(st.person.name, 'Priya Nair')
  await assert.rejects(li.liCallback({ code: 'GOOD', state }, REDIRECT), /expired/, 'state is single-use')
})

test('post with poster: version fallback, image upload, hashtags, link back', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('fakepngbytes').toString('base64')
  const r = await li.liPost('We’re hiring a Java dev (4-7 yrs) #Hiring #SpringBoot', png)
  assert.equal(r.url, 'https://www.linkedin.com/feed/update/urn:li:share:999/')
  assert.equal(seen.versions.length >= 2, true, 'retried with an older version')
  assert.deepEqual(seen.uploads, [12])
  const p = seen.posts[0]
  assert.equal(p.author, 'urn:li:person:abc123')
  assert.equal(p.content.media.id, 'urn:li:image:IMG1')
  assert.match(p.commentary, /\\\(4-7 yrs\\\)/, 'reserved characters escaped')
  assert.match(p.commentary, /\{hashtag\|\\#\|Hiring\}/)
  // The working version is remembered: next call needs no retry
  const before = seen.versions.length
  await li.liPost('Second post', null)
  assert.equal(seen.versions.length, before + 1)
})

test('disconnect keeps app keys, drops access', async () => {
  li.liDisconnect()
  assert.equal(li.liStatus(REDIRECT).connected, false)
  assert.equal(li.liStatus(REDIRECT).clientId, '86abc12xyz3456')
  await assert.rejects(li.liPost('x'), /Connect LinkedIn first/)
})
