import { useEffect, useRef, useState } from 'react'
import ImageOCR from '../components/ImageOCR.jsx'
import { downloadPost, FORMATS } from '../download.js'
import { Keyboard, Mic, ImageUp, Loader2, Wand2, Check, AlertTriangle, HelpCircle, UserPlus, UserCheck, X, Search, Eye, EyeOff, Trash2, Save, Info, Download } from 'lucide-react'

const STATUSES = ['selected', 'rejected', 'hold', 'moderate', 'eliminated', 'in process']
const LABELS = {
  name: 'Name', phone: 'Phone', email: 'Email', status: 'Status', reason: 'Reason / remark', company: 'Client company', role: 'Role',
  notice: 'Notice period', ctc: 'Current CTC', ectc: 'Expected CTC', currentCompany: 'Current company', previousCompany: 'Previous company',
  leavingReason: 'Reason for leaving', leavingDate: 'Left on', location: 'Lives in', jobLocation: 'Job location',
  qualification: 'Highest qualification', dob: 'Date of birth', pan: 'PAN', skills: 'Skills', date: 'Status date',
}
const FIELD_ORDER = Object.keys(LABELS)
const json = async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j }
const api = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json)
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function Memory() {
  const [mode, setMode] = useState('type')
  const [text, setText] = useState('')
  const [source, setSource] = useState('text')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState(null)
  const [aiNote, setAiNote] = useState('')
  const [aiReady, setAiReady] = useState(false)
  const [useAI, setUseAI] = useState(false)
  const [saved, setSaved] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    fetch('/api/ai/config').then((r) => r.json()).then((c) => { const on = Object.values(c.providers).some((p) => p.enabled); setAiReady(on); setUseAI(on) }).catch(() => {})
  }, [])

  async function read() {
    setError(''); setSaved(''); setBusy('read')
    try {
      const r = await api('/api/memory/parse', { text, useAI: useAI && aiReady })
      setItems(r.items.map((it) => ({ ...it, answers: { match: it.matchId ?? (it.questions.some((q) => q.kind === 'match') ? undefined : null) }, confirmed: {} })))
      setAiNote(r.ai.error || (r.ai.used ? 'Read with AI, then checked offline.' : ''))
      requestAnimationFrame(() => document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const update = (i, patch) => setItems((cur) => cur.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  const blockers = (it) => {
    const b = []
    const isNew = it.answers.match == null
    if (it.questions.some((q) => q.kind === 'match') && it.answers.match === undefined) b.push('Choose who this is')
    if (isNew && !it.fields.name?.trim()) b.push('Add a name')
    if (isNew && !it.fields.status) b.push('Pick a status')
    it.questions.forEach((q, qi) => { if (q.kind === 'confirm' && !it.confirmed[qi]) b.push('Confirm the change') })
    return b
  }

  async function saveAll() {
    setError(''); setBusy('save')
    try {
      const r = await api('/api/memory/save', { items: items.map((it) => ({ fields: it.fields, matchId: it.answers.match ?? null })), note: text, source })
      setSaved(`Saved ${r.ids.length} ${r.ids.length === 1 ? 'candidate' : 'candidates'} to memory.`)
      setItems(null); setText(''); setRefresh((n) => n + 1)
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const allClear = items?.length && items.every((it) => !blockers(it).length)

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Memory · Tracker</p>
        <h1>Tell me what happened. <em>I’ll remember.</em></h1>
        <p className="lede">Type it, say it, or drop a screenshot. I pull out each candidate’s details and ask about anything unclear before saving, so your tracker never gets muddled.</p>
      </header>

      <section className="composer">
        <div className="mode-tabs" role="tablist" aria-label="Input method">
          {[['type', 'Type', Keyboard], ['speak', 'Speak', Mic], ['image', 'Image', ImageUp]].map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {mode === 'speak' && <Speak onText={(t) => { setText((cur) => (cur ? cur + ' ' : '') + t); setSource('speech') }} />}
        {mode === 'image' && <ImageOCR onText={(t) => { setText((cur) => (cur ? cur + '\n' : '') + t); setSource('image') }} />}
        <label className="sr" htmlFor="note">Note</label>
        <textarea id="note" value={text} onChange={(e) => setText(e.target.value)} rows={mode === 'type' ? 6 : 4}
          placeholder={'e.g. Rahul Sharma selected for Infosys Java Developer, notice 30 days, CTC 12 LPA expected 16 LPA, lives in Hyderabad, job in Bangalore. Anita Verma rejected by Accenture due to weak communication.'} />
        <div className="composer-foot">
          <label className="switch">
            <input type="checkbox" checked={useAI && aiReady} disabled={!aiReady} onChange={(e) => setUseAI(e.target.checked)} />
            <span>Read with AI<small>{aiReady ? 'Better with messy notes and screenshots' : 'Works offline; add a key in AI Settings for AI'}</small></span>
          </label>
          <button className="cta" disabled={!text.trim() || !!busy} onClick={read}>
            {busy === 'read' ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />} Read note
          </button>
        </div>
      </section>

      {error && <p className="alert" role="alert"><AlertTriangle size={16} /> {error}</p>}
      {saved && <p className="note success" role="status"><Check size={16} /> {saved}</p>}

      {items && (
        <section id="review" className="review">
          <div className="results-head">
            <div><h2>Check before saving</h2><p className="muted">{items.length} {items.length === 1 ? 'person' : 'people'} found{aiNote ? ` · ${aiNote}` : ''}</p></div>
            <div className="row-gap">
              <button className="ghost" onClick={() => setItems(null)}>Discard</button>
              <button className="cta small" disabled={!allClear || !!busy} onClick={saveAll}>
                {busy === 'save' ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save {items.length > 1 ? 'all' : ''}
              </button>
            </div>
          </div>
          {items.length === 0 && <p className="empty">I couldn't find a candidate in that note.</p>}
          {items.map((it, i) => (
            <ReviewCard key={i} it={it} index={i} blockers={blockers(it)} onChange={(patch) => update(i, patch)} onRemove={() => setItems(items.filter((_, k) => k !== i))} />
          ))}
        </section>
      )}

      <Tracker refresh={refresh} />
    </div>
  )
}

function ReviewCard({ it, index, blockers, onChange, onRemove }) {
  const setField = (k, v) => onChange({ fields: { ...it.fields, [k]: v } })
  const changed = new Map(it.changes.map((c) => [c.field, c.from]))
  const isUpdate = it.answers.match != null
  const shown = FIELD_ORDER.filter((k) => it.fields[k] != null && it.fields[k] !== '' || ['name', 'status', 'company', 'reason'].includes(k))
  const [more, setMore] = useState(false)
  const hidden = FIELD_ORDER.filter((k) => !shown.includes(k))

  return (
    <article className={`review-card ${blockers.length ? 'needs' : 'ready'}`} style={{ '--i': index }}>
      <header>
        <span className={`who-tag ${isUpdate ? 'upd' : 'new'}`}>{isUpdate ? <UserCheck size={14} /> : <UserPlus size={14} />}{isUpdate ? 'Updates existing' : 'New candidate'}</span>
        <h3>{it.fields.name || it.existing?.name || 'Unnamed'}</h3>
        <button className="icon-btn" onClick={onRemove} aria-label="Leave this person out"><X size={16} /></button>
      </header>

      {it.questions.length > 0 && (
        <div className="questions">
          {it.questions.map((q, qi) => (
            <div key={qi} className={`q ${q.kind}`}>
              {q.kind === 'warn' ? <Info size={16} /> : <HelpCircle size={16} />}
              <div>
                <p>{q.message}</p>
                {q.kind === 'required' && q.field === 'name' && <input className="q-input" placeholder="Full name" value={it.fields.name || ''} onChange={(e) => setField('name', e.target.value)} />}
                {q.kind === 'choose' && (
                  <div className="pills">{q.options.map((o) => <button key={o} className={it.fields.status === o ? 'on' : ''} onClick={() => setField('status', o)}>{cap(o)}</button>)}</div>
                )}
                {q.kind === 'match' && (
                  <div className="pills col">
                    {q.options.map((o) => <button key={o.id} className={it.answers.match === o.id ? 'on' : ''} onClick={() => onChange({ answers: { ...it.answers, match: o.id } })}>{o.label}</button>)}
                    <button className={it.answers.match === null ? 'on' : ''} onClick={() => onChange({ answers: { ...it.answers, match: null } })}>No, this is a new person</button>
                  </div>
                )}
                {q.kind === 'confirm' && (
                  <label className="confirm"><input type="checkbox" checked={!!it.confirmed[qi]} onChange={(e) => onChange({ confirmed: { ...it.confirmed, [qi]: e.target.checked } })} /> Yes, update it</label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="fields">
        {[...shown, ...(more ? hidden : [])].map((k) => (
          <label key={k} className={`fld ${changed.has(k) ? 'changed' : ''} ${it.fromResume.includes(k) ? 'resume' : ''}`}>
            <span>{LABELS[k]}{it.fromResume.includes(k) && <em> · from resume</em>}</span>
            {k === 'status'
              ? <select value={it.fields.status || ''} onChange={(e) => setField('status', e.target.value)}>
                  <option value="">{isUpdate ? `Keep (${cap(it.existing?.status) || 'none'})` : 'Choose…'}</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              : <input value={it.fields[k] || ''} type={k === 'date' || (k === 'dob' && /^\d{4}-\d{2}-\d{2}$/.test(it.fields.dob || '')) ? 'date' : 'text'} onChange={(e) => setField(k, e.target.value)} />}
            {changed.has(k) && <small>was: {String(changed.get(k)) || 'empty'}</small>}
          </label>
        ))}
      </div>
      <div className="card-foot">
        {hidden.length > 0 && <button className="link" onClick={() => setMore(!more)}>{more ? 'Fewer fields' : `Add more details (${hidden.length})`}</button>}
        {blockers.length > 0 ? <span className="blocker"><AlertTriangle size={14} /> {blockers.join(' · ')}</span> : <span className="ok-tag"><Check size={14} /> Ready</span>}
      </div>
    </article>
  )
}

function Speak({ onText }) {
  const [on, setOn] = useState(false)
  const [interim, setInterim] = useState('')
  const [err, setErr] = useState('')
  const rec = useRef(null)
  useEffect(() => () => rec.current?.stop(), [])
  if (!SpeechRec) return <p className="alert"><AlertTriangle size={16} /> Voice input needs Chrome or Edge.</p>

  function toggle() {
    if (on) { rec.current?.stop(); return }
    setErr('')
    const r = new SpeechRec()
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = true
    r.onresult = (e) => {
      let fin = '', tmp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (tmp += e.results[i][0].transcript))
      if (fin.trim()) onText(fin.trim())
      setInterim(tmp)
    }
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the address bar.' : e.error === 'network' ? 'Voice input needs an internet connection.' : `Voice input stopped (${e.error}).`)
    r.onend = () => { setOn(false); setInterim('') }
    rec.current = r
    r.start(); setOn(true)
  }
  return (
    <div className="speak">
      <button className={`mic ${on ? 'live' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Stop listening' : 'Start listening'}>
        <Mic size={26} />
        <i /><i /><i />
      </button>
      <div>
        <strong>{on ? 'Listening… speak naturally' : 'Tap to speak'}</strong>
        <p className="muted">{interim || 'Say things like “Rahul Sharma selected for Infosys, notice thirty days”. Text appears below; you can edit it.'}</p>
        {err && <p className="status bad"><AlertTriangle size={14} /> {err}</p>}
      </div>
    </div>
  )
}

function Tracker({ refresh }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [err, setErr] = useState('')
  const [dl, setDl] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/candidates?${new URLSearchParams({ ...(q && { q }), ...(status && { status }) })}`).then(json).then((r) => setRows(r.candidates)).catch((e) => setErr(e.message))
    }, 200)
    return () => clearTimeout(t)
  }, [q, status, refresh])

  return (
    <section className="tracker">
      <div className="results-head">
        <div><h2>In memory</h2><p className="muted">{rows.length} candidates{status ? ` · ${status}` : ''}</p></div>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <span className="sr">Search memory</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, skill, company, reason…" />
        </label>
      </div>
      <div className="filter-bar">
        <div className="pills filter">
          {['', ...STATUSES].map((s) => <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s ? cap(s) : 'All'}</button>)}
        </div>
        {rows.length > 0 && (
          <div className="export-row">
            <span className="muted">Download this list:</span>
            {FORMATS.map(([f, label]) => (
              <button key={f} className="ghost" disabled={!!dl} onClick={async () => { setDl(f); try { await downloadPost('/api/tracker/export-list', { status, q, format: f }) } catch (e) { setErr(e.message) } finally { setDl('') } }}>
                {dl === f ? <Loader2 className="spin" size={16} /> : <Download size={16} />} {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {err && <p className="alert"><AlertTriangle size={16} /> {err}</p>}
      <div className="table-card plain">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Client</th><th>Role</th><th>Notice</th><th>Exp. CTC</th><th>Lives in</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id} style={{ '--i': i }} className="clickable" tabIndex={0} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(c.id)}>
                    <td><strong>{c.name}</strong><span className="file">{c.email || c.phone || ''}</span></td>
                    <td><span className={`chip-status s-${(c.status || '').replace(' ', '-')}`}>{cap(c.status) || '—'}</span></td>
                    <td>{c.company || '—'}</td><td>{c.role || '—'}</td><td>{c.notice || '—'}</td>
                    <td>{c.ectc || '—'}</td><td>{c.location || '—'}</td><td>{c.statusDate || c.updatedAt?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">{q || status ? 'No one matches that.' : 'Nothing saved yet. Add your first note above.'}</p>}
      </div>
      {open && <Drawer id={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); setRows((r) => r.filter((x) => x.id !== open)) }} />}
    </section>
  )
}

function Drawer({ id, onClose, onDeleted }) {
  const [c, setC] = useState(null)
  const [reveal, setReveal] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { fetch(`/api/candidates/${id}${reveal ? '?reveal=1' : ''}`).then(json).then(setC) }, [id, reveal])
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  async function del() { await api(`/api/candidates/${id}`, {}, 'DELETE'); onDeleted() }
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Candidate details" onClick={(e) => e.stopPropagation()}>
        {!c ? <Loader2 className="spin" /> : (<>
          <header>
            <div><h2>{c.name}</h2><span className={`chip-status s-${(c.status || '').replace(' ', '-')}`}>{cap(c.status)}</span></div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <dl>
            {FIELD_ORDER.filter((k) => !['name', 'status', 'date'].includes(k) && c[k]).map((k) => (
              <div key={k}><dt>{LABELS[k]}</dt><dd>{c[k]}{k === 'pan' && <button className="icon-btn inline" onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide PAN' : 'Show PAN'}>{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>}</dd></div>
            ))}
          </dl>
          <h3>History</h3>
          <ol className="timeline">
            {c.events.map((e) => (
              <li key={e.id}>
                <span className="t-date">{e.date}</span>
                <p>{e.status ? <b>{cap(e.status)}</b> : 'Details updated'}{e.company ? ` · ${e.company}` : ''}{e.role ? ` · ${e.role}` : ''}</p>
                {e.reason && <p className="muted">{e.reason}</p>}
              </li>
            ))}
          </ol>
          <div className="drawer-foot">
            {confirmDel
              ? <><span>Delete {c.name} and their history? This can't be undone.</span><button className="ghost danger" onClick={del}>Delete</button><button className="ghost" onClick={() => setConfirmDel(false)}>Cancel</button></>
              : <button className="ghost danger" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Delete</button>}
          </div>
        </>)}
      </aside>
    </div>
  )
}
