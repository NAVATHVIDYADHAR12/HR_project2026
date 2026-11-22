import { db } from './db.js'

// Both providers speak the OpenAI chat-completions API, so one client serves both.
export const PROVIDERS = {
  groq: { label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  nvidia: { label: 'NVIDIA NIM', baseURL: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b', keyUrl: 'https://build.nvidia.com', keyPrefix: 'nvapi-' },
  // OpenRouter hosts NVIDIA Nemotron (and many others) behind one key.
  openrouter: { label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free', keyUrl: 'https://openrouter.ai/keys', keyPrefix: 'sk-or-', headers: { 'HTTP-Referer': 'http://localhost', 'X-Title': 'TalentDesk' } },
}
PROVIDERS.groq.keyPrefix = 'gsk_'
// Preference order when the saved model is no longer offered by the provider. Nemotron first (asked for), free tiers before paid.
const PREFERRED = [/nemotron.*ultra.*:free/i, /nemotron.*ultra/i, /nemotron.*super.*:free/i, /nemotron.*super/i, /nemotron.*:free/i, /llama-3\.3-70b/i, /llama.*70b/i, /gpt-oss-120b/i, /llama-4/i, /qwen/i, /llama/i]
const NOT_CHAT = /whisper|tts|embed|guard|rerank|clip|detector|safety|translate|gliner|calibration|starcoder|riva|cosmos|video|vision-only|playai|orpheus|prompt-guard|compound/i

const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
const setSetting = (k, v) => v == null
  ? db.prepare('DELETE FROM settings WHERE key = ?').run(k)
  : db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)

export function getConfig() {
  return JSON.parse(getSetting('ai') || '{"primary":"groq","providers":{}}')
}

// What the browser may see: never the key itself.
export function publicConfig() {
  const c = getConfig()
  const providers = {}
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const s = c.providers[id] || {}
    providers[id] = { ...p, model: s.model || p.defaultModel, hasKey: !!s.key, keyHint: s.key ? `${s.key.slice(0, 4)}…${s.key.slice(-4)}` : '', enabled: !!s.key && s.enabled !== false }
  }
  return { primary: c.primary, providers }
}

export function saveConfig({ primary, provider, key, model, enabled }) {
  const c = getConfig()
  if (primary && PROVIDERS[primary]) c.primary = primary
  if (provider && PROVIDERS[provider]) {
    const s = (c.providers[provider] ||= {})
    if (key !== undefined) s.key = key.trim() || undefined // empty string removes the key
    if (model) s.model = model.trim()
    if (enabled !== undefined) s.enabled = !!enabled
    if (!c.providers[c.primary]?.key && s.key) c.primary = provider // first working key becomes primary
  }
  setSetting('ai', JSON.stringify(c))
  return publicConfig()
}

export const aiAvailable = () => Object.values(publicConfig().providers).some((p) => p.enabled)

async function call(id, path, body, key) {
  const p = PROVIDERS[id]
  const res = await fetch(p.baseURL + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...p.headers },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text
    try { msg = JSON.parse(text).error?.message || JSON.parse(text).detail || text } catch {}
    const hint = res.status === 401 || res.status === 403 ? ' (key rejected: check you copied the whole key)' : res.status === 404 ? ' (model not available: click Test connection to refresh the list)' : ''
    const err = new Error(`${p.label} ${res.status}: ${String(msg).slice(0, 200) || res.statusText}${hint}`)
    err.status = res.status
    err.retryAfter = Number(res.headers.get('retry-after')) || 0
    throw err
  }
  return res.json()
}

// Test a key (saved or freshly typed) and list the chat models it can use.
export async function testProvider(id, keyOverride) {
  const key = keyOverride || getConfig().providers[id]?.key
  if (!key) throw new Error('No API key saved for this provider.')
  const other = Object.entries(PROVIDERS).find(([pid, p]) => pid !== id && p.keyPrefix && key.startsWith(p.keyPrefix))
  if (other) throw new Error(`This looks like ${/^[AEIOU]/i.test(other[1].label) ? 'an' : 'a'} ${other[1].label} key. Paste it in the ${other[1].label} card instead.`)
  const t = Date.now()
  const { data = [] } = await call(id, '/models', null, key)
  const models = data.map((m) => m.id).filter((m) => !NOT_CHAT.test(m)).sort()
  const saved = getConfig().providers[id]?.model || PROVIDERS[id].defaultModel
  const model = models.includes(saved) ? saved : (PREFERRED.map((re) => models.find((m) => re.test(m))).find(Boolean) || models[0] || saved)
  // Listing models can work without auth (NVIDIA), so prove the key with a 1-token chat call.
  await call(id, '/chat/completions', { model, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 1 }, key)
  return { ok: true, ms: Date.now() - t, models, model }
}

const stripThinking = (s) => s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

/**
 * Chat with the primary provider, falling back to the other configured one.
 * Throws if none works: callers must then use their offline logic.
 */
export async function chat(messages, { json = false, temperature = 0.2, maxTokens = 1024 } = {}) {
  const c = getConfig()
  const order = [c.primary, ...Object.keys(PROVIDERS).filter((id) => id !== c.primary)]
    .filter((id) => c.providers[id]?.key && c.providers[id].enabled !== false)
  if (!order.length) throw new Error('No AI provider configured.')
  let lastErr
  for (const id of order) {
    const s = c.providers[id]
    const model = s.model || PROVIDERS[id].defaultModel
    // Llama-based Nemotron reasons unless told "detailed thinking off"; keeps answers short and fast.
    const msgs = /llama.*nemotron/i.test(model) ? [{ role: 'system', content: 'detailed thinking off' }, ...messages] : messages
    // Reasoning models think before answering: keep thinking short and leave room for the answer.
    const reasoning = /gpt-oss|qwen3|deepseek-r1|nemotron|magistral|\bo[1-4]\b/i.test(model)
    let budget = reasoning ? Math.max(maxTokens, 1500) : maxTokens
    let jsonMode = json && id === 'groq'
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await call(id, '/chat/completions', {
          model, messages: msgs, temperature, max_tokens: budget,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          ...(reasoning && id === 'groq' && /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
          ...(reasoning && id === 'openrouter' ? { reasoning: { effort: 'low', exclude: true } } : {}),
        }, s.key)
        const choice = out.choices?.[0] || {}
        const text = stripThinking(choice.message?.content || '')
        // Reasoning models can spend the whole budget thinking and return nothing: retry with more room.
        if (!text && choice.finish_reason === 'length' && attempt < 2) { budget *= 4; continue }
        if (!text) throw Object.assign(new Error(`${PROVIDERS[id].label} returned an empty answer`), { status: 502 })
        return { text, json: json ? parseJSON(text) : undefined, provider: id, model }
      } catch (e) {
        lastErr = e
        // Groq's strict JSON check failed (often an empty answer): retry once without it; parseJSON copes with loose JSON.
        if (e.status === 400 && jsonMode && /json_validate_failed|validate JSON/i.test(e.message)) { jsonMode = false; budget *= 2; continue }
        if (e.status === 429 && attempt < 2) { await sleep(Math.min(e.retryAfter || 2 ** attempt * 2, 20) * 1000); continue }
        if (e.status >= 500 && attempt < 1) { await sleep(1500); continue }
        break // auth/bad request/etc: try next provider
      }
    }
  }
  throw lastErr
}

// Models sometimes wrap JSON in prose or ```fences```: take the outermost object/array.
export function parseJSON(text) {
  const m = text.match(/[\[{][\s\S]*[\]}]/)
  if (!m) throw new Error('AI did not return JSON')
  return JSON.parse(m[0])
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Run async fn over items with limited parallelism (free tiers rate-limit hard).
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}
