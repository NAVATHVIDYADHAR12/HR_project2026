import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Loader2, X, Plus, Bot, AlertTriangle, Sparkles, UserRound, Download, FileSpreadsheet } from 'lucide-react'
import TrackerFormat from '../components/TrackerFormat.jsx'
import { downloadPost, FORMATS } from '../download.js'

// Download this answer's rows in the saved tracker format, as Excel, Word or PDF.
const downloadTracker = (q, filters, format = 'xlsx') => downloadPost('/api/tracker/export', { q, filters, format })

const COLS = { name: 'Name', evStatus: 'Status', evCompany: 'Client', evRole: 'Role', evDate: 'Date', evReason: 'Reason', notice: 'Notice', ectc: 'Exp. CTC', location: 'Lives in', phone: 'Phone', email: 'Email' }
const STATUSES = ['selected', 'rejected', 'hold', 'moderate', 'eliminated', 'in process']
const SUGGEST = [
  'How many selected this month?',
  'Who was rejected and why?',
  'Moderate candidates without already selected and rejected',
  'Who is on hold?',
  'Recent 5',
  'Java candidates in Hyderabad, immediate joiners',
  'Send me the current tracker of selected candidates',
]
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
const post = (body) => fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j })

export default function Ask() {
  const [q, setQ] = useState('')
  const [thread, setThread] = useState([])
  const [busy, setBusy] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [useAI, setUseAI] = useState(false)
  const [showFormat, setShowFormat] = useState(false)
  const end = useRef()
  useEffect(() => {
    fetch('/api/ai/config').then((r) => r.json()).then((c) => setAiReady(Object.values(c.providers).some((p) => p.enabled))).catch(() => {})
  }, [])
  // Scroll when a question is added and again when its answer arrives (answers are taller than the loader).
  const lastDone = thread.length ? !thread.at(-1).loading : false
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [thread.length, lastDone])

  async function send(text = q) {
    if (!text.trim() || busy) return
    setQ(''); setBusy(true)
    const id = Date.now()
    setThread((t) => [...t, { id, q: text, loading: true }])
    try {
      const r = await post({ q: text, useAI: useAI && aiReady })
      // "send me the tracker…" downloads straight away when there is something to send.
      let downloaded = ''
      if (r.filters.export && r.count > 0) downloaded = await downloadTracker(text, r.filters, r.filters.exportFormat).catch(() => '')
      setThread((t) => t.map((m) => (m.id === id ? { id, q: text, ...r, downloaded } : m)))
    }
    catch (e) { setThread((t) => t.map((m) => (m.id === id ? { id, q: text, error: e.message } : m))) }
    finally { setBusy(false) }
  }
  // Chip edits re-run the same question with adjusted filters, in place.
  async function refine(id, filters) {
    const m = thread.find((x) => x.id === id)
    setThread((t) => t.map((x) => (x.id === id ? { ...x, loading: true } : x)))
    try { const r = await post({ q: m.q, filters }); setThread((t) => t.map((x) => (x.id === id ? { id, q: m.q, ...r, ai: m.ai } : x))) }
    catch (e) { setThread((t) => t.map((x) => (x.id === id ? { ...x, loading: false, error: e.message } : x))) }
  }

  return (
    <div className="page ask-page">
      <header className="hero">
        <p className="eyebrow">Memory · Ask</p>
        <h1>Ask your tracker <em>anything.</em></h1>
        <p className="lede">Answers come straight from your saved candidates, so nothing is guessed. Click any filter chip to adjust the answer. Say “tracker” or “excel” to get it as a spreadsheet.</p>
        <button className="ghost format-btn" onClick={() => setShowFormat(true)}><FileSpreadsheet size={16} /> Tracker format</button>
      </header>
      {showFormat && <TrackerFormat onClose={() => setShowFormat(false)} />}

      {thread.length === 0 && (
        <div className="suggest">
          {SUGGEST.map((s, i) => <button key={s} style={{ '--i': i }} onClick={() => send(s)}><Sparkles size={14} aria-hidden="true" /> {s}</button>)}
        </div>
      )}

      <div className="thread" aria-live="polite">
        {thread.map((m) => <Turn key={m.id} m={m} onRefine={(f) => refine(m.id, f)} />)}
        <div ref={end} />
      </div>

      <form className="ask-bar" onSubmit={(e) => { e.preventDefault(); send() }}>
        <label className="sr" htmlFor="ask">Your question</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. who was rejected for Infosys last month and why?" autoComplete="off" />
        <label className="switch compact" title={aiReady ? 'Let AI read your question' : 'Add a key in AI Settings'}>
          <input type="checkbox" checked={useAI && aiReady} disabled={!aiReady} onChange={(e) => setUseAI(e.target.checked)} />
          <span>AI</span>
        </label>
        <button className="send" type="submit" disabled={!q.trim() || busy} aria-label="Ask">{busy ? <Loader2 className="spin" size={18} /> : <ArrowUp size={18} />}</button>
      </form>
    </div>
  )
}

function Turn({ m, onRefine }) {
  return (
    <div className="turn">
      <p className="bubble">{m.q}</p>
      <div className="answer">
        {m.loading && <p className="muted"><Loader2 className="spin" size={16} /> Looking through memory…</p>}
        {m.error && <p className="alert"><AlertTriangle size={16} /> {m.error}</p>}
        {!m.loading && !m.error && m.text && (<>
          <p className="answer-text">{m.ai?.used && <span className="ai-badge"><Bot size={12} /> AI</span>} {m.text}</p>
          {m.ai?.error && <p className="muted small-note">{m.ai.error}</p>}
          <Chips f={m.filters} onChange={onRefine} />
          {m.detail && <Detail c={m.detail} />}
          {m.rows?.length > 0 && <Table cols={m.columns} rows={m.rows} />}
          {m.count > 0 && <ExportButton q={m.q} filters={m.filters} done={m.downloaded} />}
        </>)}
      </div>
    </div>
  )
}

function ExportButton({ q, filters, done }) {
  const [state, setState] = useState(done ? { ok: done } : null)
  async function go(format) {
    setState({ busy: format })
    try { setState({ ok: await downloadTracker(q, filters, format) }) } catch (e) { setState({ err: e.message }) }
  }
  return (
    <div className="export-row">
      <span className="muted">Download:</span>
      {FORMATS.map(([f, label]) => (
        <button key={f} className="ghost" onClick={() => go(f)} disabled={!!state?.busy}>{state?.busy === f ? <Loader2 className="spin" size={16} /> : <Download size={16} />} {label}</button>
      ))}
      {state?.ok && <span className="muted">Saved {state.ok}</span>}
      {state?.err && <span className="status bad"><AlertTriangle size={14} /> {state.err}</span>}
    </div>
  )
}

function Chips({ f, onChange }) {
  const [adding, setAdding] = useState(false)
  const [co, setCo] = useState('')
  const without = (k, v) => onChange({ ...f, [k]: f[k].filter((x) => x !== v) })
  const toggleEx = (s) => onChange({ ...f, excludeStatuses: f.excludeStatuses.includes(s) ? f.excludeStatuses.filter((x) => x !== s) : [...f.excludeStatuses, s] })
  const chips = [
    ...f.statuses.map((s) => ({ label: cap(s), remove: () => without('statuses', s) })),
    ...f.companies.map((c) => ({ label: `Client: ${c}`, remove: () => without('companies', c) })),
    ...f.excludeCompanies.map((c) => ({ label: `Not ${c}`, remove: () => without('excludeCompanies', c), neg: true })),
    ...f.skills.map((s) => ({ label: s, remove: () => without('skills', s) })),
    ...f.locations.map((l) => ({ label: `In ${l}`, remove: () => without('locations', l) })),
    ...f.names.map((n) => ({ label: n, remove: () => without('names', n) })),
    ...(f.dateFrom ? [{ label: f.dateLabel || `${f.dateFrom} → ${f.dateTo}`, remove: () => onChange({ ...f, dateFrom: undefined, dateTo: undefined, dateLabel: undefined }) }] : []),
    ...(f.maxNotice != null ? [{ label: f.maxNotice === 15 ? 'Immediate joiners' : `Notice ≤ ${f.maxNotice}d`, remove: () => onChange({ ...f, maxNotice: undefined }) }] : []),
    ...(f.maxEctc != null ? [{ label: `Exp. CTC ≤ ${Math.round(f.maxEctc * 10) / 10}L`, remove: () => onChange({ ...f, maxEctc: undefined }) }] : []),
  ]
  return (
    <div className="chips-row">
      {chips.map((c) => (
        <span key={c.label} className={`fchip ${c.neg ? 'neg' : ''}`}>{c.label}<button onClick={c.remove} aria-label={`Remove ${c.label}`}><X size={12} /></button></span>
      ))}
      {['selected', 'rejected'].map((s) => (
        <button key={s} className={`fchip toggle ${f.excludeStatuses.includes(s) ? 'on' : ''}`} aria-pressed={f.excludeStatuses.includes(s)} onClick={() => toggleEx(s)}>
          Hide already {s}
        </button>
      ))}
      {f.excludeStatuses.filter((s) => !['selected', 'rejected'].includes(s)).map((s) => (
        <span key={s} className="fchip neg">Hide {s}<button onClick={() => toggleEx(s)} aria-label={`Stop hiding ${s}`}><X size={12} /></button></span>
      ))}
      <select className="fchip add" value="" onChange={(e) => e.target.value && onChange({ ...f, statuses: [...new Set([...f.statuses, e.target.value])] })} aria-label="Add status filter">
        <option value="">+ Status</option>
        {STATUSES.filter((s) => !f.statuses.includes(s)).map((s) => <option key={s} value={s}>{cap(s)}</option>)}
      </select>
      {adding
        ? <form className="fchip add-co" onSubmit={(e) => { e.preventDefault(); if (co.trim()) onChange({ ...f, companies: [...f.companies, co.trim()] }); setCo(''); setAdding(false) }}>
            <input autoFocus value={co} onChange={(e) => setCo(e.target.value)} placeholder="Client name" onBlur={() => !co && setAdding(false)} />
          </form>
        : <button className="fchip add" onClick={() => setAdding(true)}><Plus size={12} /> Client</button>}
    </div>
  )
}

function Table({ cols, rows }) {
  return (
    <div className="table-card plain ask-table">
      <div className="table-wrap">
        <table>
          <thead><tr>{cols.map((c) => <th key={c}>{COLS[c]}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ '--i': i }}>
                {cols.map((c) => (
                  <td key={c} className={c === 'evReason' ? 'wrap' : ''}>
                    {c === 'name' ? <strong>{r.name}</strong>
                      : c === 'evStatus' ? <span className={`chip-status s-${(r.evStatus || '').replace(' ', '-')}`}>{cap(r.evStatus) || '—'}</span>
                      : r[c] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Detail({ c }) {
  const facts = [['Client', c.company], ['Role', c.role], ['Notice', c.notice], ['Current CTC', c.ctc], ['Expected CTC', c.ectc], ['Lives in', c.location], ['Job location', c.jobLocation],
    ['Previous company', c.previousCompany], ['Left', [c.leavingDate, c.leavingReason].filter(Boolean).join(' · ')], ['Qualification', c.qualification], ['Phone', c.phone], ['Email', c.email]].filter(([, v]) => v)
  return (
    <div className="detail-card">
      <div className="detail-head"><UserRound size={20} aria-hidden="true" /><h3>{c.name}</h3><span className={`chip-status s-${(c.status || '').replace(' ', '-')}`}>{cap(c.status)}</span></div>
      <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <ol className="timeline">
        {c.events.map((e) => (
          <li key={e.id}><span className="t-date">{e.date}</span><p>{e.status ? <b>{cap(e.status)}</b> : 'Details updated'}{e.company ? ` · ${e.company}` : ''}{e.role ? ` · ${e.role}` : ''}</p>{e.reason && <p className="muted">{e.reason}</p>}</li>
        ))}
      </ol>
    </div>
  )
}
