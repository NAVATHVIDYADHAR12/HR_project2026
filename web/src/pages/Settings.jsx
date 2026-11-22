import { useEffect, useState } from 'react'
import { KeyRound, Eye, EyeOff, PlugZap, Check, AlertTriangle, Loader2, ExternalLink, Send, Trash2, DatabaseBackup, Download, Copy } from 'lucide-react'

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j })

export default function Settings() {
  const [cfg, setCfg] = useState(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => { fetch('/api/ai/config').then((r) => r.json()).then(setCfg).catch(() => setLoadError('Could not reach the TalentDesk server. Is it running?')) }, [])
  if (loadError) return <div className="page"><p className="alert" role="alert"><AlertTriangle size={16} /> {loadError}</p></div>
  if (!cfg) return <div className="page"><Loader2 className="spin" /></div>

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Settings · AI</p>
        <h1>Bring your own <em>free</em> AI.</h1>
        <p className="lede">Everything in TalentDesk works offline. Add a free Groq or NVIDIA key and the app uses it for sharper matching, smarter questions and better writing. Keys stay on this computer.</p>
      </header>

      <div className="providers">
        {Object.entries(cfg.providers).map(([id, p], i) => (
          <Provider key={id} id={id} p={p} primary={cfg.primary === id} onChange={setCfg} index={i} />
        ))}
      </div>

      <Playground enabled={Object.values(cfg.providers).some((p) => p.enabled)} />
      <ExtensionKey />
      <DataSection />
    </div>
  )
}

function ExtensionKey() {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { fetch('/api/auth/extension-key').then((r) => r.json()).then((r) => setKey(r.key || '')).catch(() => {}) }, [])
  const copy = async () => { try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  const rotate = async () => { const r = await post('/api/auth/extension-key', {}); setKey(r.key); setShow(true) }
  return (
    <section className="playground data-section">
      <h2><KeyRound size={20} /> Extension key</h2>
      <p className="muted">Paste this once into the TalentDesk Chrome extension so it can send results to this app.</p>
      <div className="play-row">
        <input readOnly value={show ? key : key.replace(/.(?=.{4})/g, '•')} aria-label="Extension key" onFocus={(e) => e.target.select()} />
        <button className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Show key'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        <button className="ghost" onClick={copy} disabled={!key}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button>
        <button className="ghost" onClick={rotate} title="The old key stops working">New key</button>
      </div>
    </section>
  )
}

function DataSection() {
  return (
    <section className="playground data-section">
      <h2><DatabaseBackup size={20} /> Your data</h2>
      <p className="muted">Everything (candidates, history, resumes, templates, groups, settings and AI keys) lives in one file on this computer: <code>data/talentdesk.db</code>. Nothing is uploaded anywhere except what you send to your AI provider.</p>
      <div className="row-gap">
        <a className="cta small" href="/api/backup" download><Download size={16} /> Download backup</a>
      </div>
      <details className="restore">
        <summary>How to restore a backup</summary>
        <ol>
          <li>Close TalentDesk (close its window).</li>
          <li>In the project’s <code>data</code> folder, rename <code>talentdesk.db</code> to <code>talentdesk-old.db</code>.</li>
          <li>Copy your backup file into <code>data</code> and rename it to <code>talentdesk.db</code>.</li>
          <li>Start TalentDesk again.</li>
        </ol>
        <p className="muted">The backup includes your AI keys. Keep it somewhere private.</p>
      </details>
    </section>
  )
}

function Provider({ id, p, primary, onChange, index }) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [models, setModels] = useState([])
  const [status, setStatus] = useState(null) // {ok, msg}
  const [busy, setBusy] = useState('')

  async function run(label, fn) {
    setBusy(label); setStatus(null)
    try { await fn() } catch (e) { setStatus({ ok: false, msg: e.message }) } finally { setBusy('') }
  }
  const save = () => run('save', async () => {
    const typed = key.trim()
    // Test before saving so a typo'd key never gets stored silently.
    const t = await post('/api/ai/test', { provider: id, key: typed })
    setModels(t.models)
    onChange(await post('/api/ai/config', { provider: id, key: typed, enabled: true, model: t.model }))
    setKey('')
    setStatus({ ok: true, msg: `Connected in ${t.ms} ms · ${t.models.length} models available` })
  })
  const test = () => run('test', async () => {
    const t = await post('/api/ai/test', { provider: id })
    setModels(t.models)
    if (t.model !== p.model) onChange(await post('/api/ai/config', { provider: id, model: t.model })) // saved model was retired
    setStatus({ ok: true, msg: `Connected in ${t.ms} ms · ${t.models.length} models available` })
  })
  const remove = () => run('remove', async () => { onChange(await post('/api/ai/config', { provider: id, key: '' })); setModels([]); setStatus(null) })
  const setModel = (model) => run('model', async () => onChange(await post('/api/ai/config', { provider: id, model })))
  const toggle = () => run('toggle', async () => onChange(await post('/api/ai/config', { provider: id, enabled: !p.enabled })))
  const makePrimary = () => run('primary', async () => onChange(await post('/api/ai/config', { primary: id })))

  const modelOptions = [...new Set([p.model, ...models])]
  return (
    <section className={`provider ${p.enabled ? 'on' : ''}`} style={{ '--d': `${index * 90}ms` }}>
      <div className="provider-head">
        <div>
          <h2>{p.label}</h2>
          <p className="muted">{p.hasKey ? `Key ${p.keyHint}` : 'No key yet'}</p>
        </div>
        <span className={`pill ${p.enabled ? 'live' : ''}`}><i aria-hidden="true" />{p.enabled ? (primary ? 'Primary' : 'Backup') : 'Off'}</span>
      </div>

      <label className="field">
        <span>{p.hasKey ? 'Replace API key' : 'API key'}</span>
        <div className="key-input">
          <KeyRound size={16} aria-hidden="true" />
          <input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder={`${p.keyPrefix || ''}…`} autoComplete="off" spellCheck="false" />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Show key'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </label>
      <a className="key-link" href={p.keyUrl} target="_blank" rel="noreferrer">Get a free key <ExternalLink size={13} /></a>

      {p.hasKey && (
        <label className="field">
          <span>Model</span>
          <select value={p.model} onChange={(e) => setModel(e.target.value)} disabled={!!busy}>
            {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {!models.length && <small className="muted">Click "Test connection" to load every model your key can use.</small>}
        </label>
      )}

      <div className="provider-actions">
        <button className="cta small" disabled={!key.trim() || !!busy} onClick={save}>
          {busy === 'save' ? <Loader2 className="spin" size={16} /> : <PlugZap size={16} />} Save & connect
        </button>
        {p.hasKey && <button className="ghost" disabled={!!busy} onClick={test}>{busy === 'test' ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Test connection</button>}
        {p.hasKey && !primary && p.enabled && <button className="ghost" disabled={!!busy} onClick={makePrimary}>Make primary</button>}
        {p.hasKey && <button className="ghost" disabled={!!busy} onClick={toggle}>{p.enabled ? 'Turn off' : 'Turn on'}</button>}
        {p.hasKey && <button className="ghost danger" disabled={!!busy} onClick={remove} aria-label={`Remove ${p.label} key`}><Trash2 size={16} /></button>}
      </div>

      {status && <p className={`status ${status.ok ? 'ok' : 'bad'}`} role="status">{status.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {status.msg}</p>}
    </section>
  )
}

function Playground({ enabled }) {
  const [q, setQ] = useState('In one sentence, what makes a strong Java backend resume?')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  async function ask() {
    setBusy(true); setOut(null)
    try { setOut(await post('/api/ai/chat', { prompt: q })) } catch (e) { setOut({ error: e.message }) } finally { setBusy(false) }
  }
  return (
    <section className="playground">
      <h2>Try it</h2>
      <p className="muted">{enabled ? 'Send a quick prompt to check answers come back.' : 'Connect a provider above to try it.'}</p>
      <div className="play-row">
        <label className="sr" htmlFor="play">Prompt</label>
        <input id="play" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enabled && !busy && ask()} />
        <button className="cta small" disabled={!enabled || busy || !q.trim()} onClick={ask}>{busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />} Send</button>
      </div>
      {out && (out.error
        ? <p className="status bad"><AlertTriangle size={16} /> {out.error}</p>
        : <div className="reply"><p>{out.text}</p><small className="muted">{out.provider} · {out.model}</small></div>)}
    </section>
  )
}
