import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-ai-test-${process.pid}.db`)
const { PROVIDERS, saveConfig, publicConfig, chat, testProvider, parseJSON } = await import('./ai.js')

// Fake OpenAI-compatible server. Groq path: first call 429, then OK. "/bad" prefix: always 401.
let groqCalls = 0
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d)).on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'retry-after': '0' }); res.end(JSON.stringify(obj)) }
    if (req.url.startsWith('/bad')) return send(401, { error: { message: 'Invalid API Key' } })
    if (req.url.endsWith('/models')) return send(200, { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }] })
    if (req.url.startsWith('/nvpub')) return send(401, { detail: 'Authentication failed' }) // models public, chat needs key
    const { model, messages, max_tokens, response_format, reasoning_effort } = JSON.parse(body)
    if (req.url.startsWith('/jsonfail') && response_format) return send(400, { error: { message: 'Failed to validate JSON.', code: 'json_validate_failed' } })
    if (req.url.startsWith('/jsonfail')) return send(200, { choices: [{ message: { content: `{"score": 77, "effort": "${reasoning_effort}", "budget": ${max_tokens}}` } }] })
    if (req.url.startsWith('/think') && max_tokens < 500) return send(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] })
    if (req.url.startsWith('/groq') && groqCalls++ === 0) return send(429, { error: { message: 'Rate limit' } })
    const thinkingOff = messages[0].content === 'detailed thinking off'
    send(200, { choices: [{ message: { content: `<think>hmm</think>Sure! \`\`\`json\n{"score": 88, "model": "${model}", "thinkingOff": ${thinkingOff}}\n\`\`\`` } }] })
  })
})
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
test.after(() => server.close())

test('keys are never exposed in public config', () => {
  saveConfig({ provider: 'groq', key: 'gsk_secret_1234567890' })
  const pub = JSON.stringify(publicConfig())
  assert.ok(!pub.includes('secret'))
  assert.match(publicConfig().providers.groq.keyHint, /^gsk_…7890$/)
  assert.equal(publicConfig().primary, 'groq')
})

test('retries 429, strips <think>, parses fenced JSON', async () => {
  PROVIDERS.groq.baseURL = `${base}/groq`
  const out = await chat([{ role: 'user', content: 'hi' }], { json: true })
  assert.equal(out.provider, 'groq')
  assert.equal(out.json.score, 88)
  assert.ok(!out.text.includes('<think>'))
  assert.equal(groqCalls, 2)
})

test('falls back to NVIDIA when Groq key is rejected', async () => {
  PROVIDERS.groq.baseURL = `${base}/bad`
  PROVIDERS.nvidia.baseURL = `${base}/nv`
  saveConfig({ provider: 'nvidia', key: 'nvapi-xyz' })
  const out = await chat([{ role: 'user', content: 'hi' }], { json: true })
  assert.equal(out.provider, 'nvidia')
  assert.equal(out.json.model, 'nvidia/nemotron-3-ultra-550b-a55b')
  assert.equal(out.json.thinkingOff, false)
})

test('llama-based Nemotron gets "detailed thinking off"', async () => {
  saveConfig({ provider: 'nvidia', model: 'nvidia/llama-3.3-nemotron-super-49b-v1' })
  assert.equal((await chat([{ role: 'user', content: 'hi' }], { json: true })).json.thinkingOff, true)
  saveConfig({ provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b' })
})

test('reasoning model that runs out of tokens is retried with a bigger budget', async () => {
  PROVIDERS.nvidia.baseURL = `${base}/think`
  assert.equal((await chat([{ role: 'user', content: 'hi' }], { json: true, maxTokens: 200 })).json.score, 88)
  PROVIDERS.nvidia.baseURL = `${base}/nv`
})

test('test connection lists chat models, picks a valid one, and rejects bad keys', async () => {
  PROVIDERS.groq.baseURL = `${base}/groq`
  const t = await testProvider('groq')
  assert.deepEqual(t.models, ['llama-3.3-70b-versatile'])
  assert.equal(t.model, 'llama-3.3-70b-versatile')
  PROVIDERS.groq.baseURL = `${base}/bad`
  await assert.rejects(testProvider('groq'), /Groq 401: Invalid API Key/)
})

test('a key that can list models but not chat is rejected (NVIDIA case)', async () => {
  PROVIDERS.nvidia.baseURL = `${base}/nvpub`
  await assert.rejects(testProvider('nvidia', 'fake'), /401/)
  PROVIDERS.nvidia.baseURL = `${base}/nv`
})

test('Groq reasoning model: low effort, bigger budget, retries without strict JSON mode', async () => {
  saveConfig({ provider: 'groq', key: 'gsk_x', model: 'openai/gpt-oss-120b', enabled: true, primary: 'groq' })
  saveConfig({ primary: 'groq' })
  PROVIDERS.groq.baseURL = `${base}/jsonfail`
  const out = await chat([{ role: 'user', content: 'x' }], { json: true, maxTokens: 200 })
  assert.equal(out.provider, 'groq')
  assert.equal(out.json.score, 77)
  assert.equal(out.json.effort, 'low')
  assert.ok(out.json.budget >= 1500)
  PROVIDERS.groq.baseURL = `${base}/groq`
})

test('a key pasted in the wrong card is caught', async () => {
  await assert.rejects(testProvider('nvidia', 'sk-or-v1-abc'), /looks like an OpenRouter key/)
})

test('disabled or removed providers are not used', async () => {
  saveConfig({ provider: 'nvidia', enabled: false })
  saveConfig({ provider: 'groq', key: '' })
  await assert.rejects(chat([{ role: 'user', content: 'x' }]), /No AI provider configured/)
})

test('parseJSON handles prose around JSON', () => {
  assert.deepEqual(parseJSON('Here you go: {"a":[1,2]} thanks'), { a: [1, 2] })
})
