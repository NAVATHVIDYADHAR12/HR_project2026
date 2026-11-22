import { useEffect, useRef, useState } from 'react'
import { Save, Trash2, Wand2, Loader2, AlertTriangle, Check, Users, Search, Send, Download, Settings2, X, Undo2, ChevronDown, Mail as MailIcon, CircleCheck, CircleX, ClipboardPaste, Inbox, Copy, ExternalLink } from 'lucide-react'
import ImageOCR from '../components/ImageOCR.jsx'

const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j }
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json)
const DETAIL_LABELS = { role: 'Role', company: 'Client company', skills: 'Skills', experience: 'Experience', location: 'Location', notice: 'Notice period', salary: 'Salary / CTC' }
const STARTER = { name: '', subject: 'Opening for {role} at {company}', body: 'Hi {firstName},\n\nHope you are doing well. Your profile looks like a great fit for a {role} role with our client {company} in {location}.\n\nSkills: {skills}\nExperience: {experience}\n\nIf interested, please reply with your updated CV, current CTC, expected CTC and notice period.\n\nThanks & Regards,\n' }

export default function Mail() {
  const [templates, setTemplates] = useState([])
  const [tpl, setTpl] = useState({ id: null, ...STARTER })
  const [undo, setUndo] = useState(null)
  const [jd, setJd] = useState('')
  const [details, setDetails] = useState(Object.fromEntries(Object.keys(DETAIL_LABELS).map((k) => [k, ''])))
  const [recipients, setRecipients] = useState([])
  const [messages, setMessages] = useState(null)
  const [aiReady, setAiReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null) // { step, bad, text }
  const [showSettings, setShowSettings] = useState(false)
  const [importing, setImporting] = useState(false)
  const body = useRef()

  useEffect(() => {
    fetch('/api/mail/templates').then(json).then((r) => setTemplates(r.templates)).catch(() => {})
    fetch('/api/ai/config').then(json).then((c) => setAiReady(Object.values(c.providers).some((p) => p.enabled))).catch(() => {})
  }, [])
  const say = (step, text, bad = false) => setNote({ step, text, bad })
  async function run(key, fn) { setBusy(key); setNote(null); try { await fn() } catch (e) { say(key, e.message, true) } finally { setBusy('') } }

  // 1. Template
  const insert = (ph) => {
    const el = body.current
    const s = el.selectionStart ?? tpl.body.length, e = el.selectionEnd ?? s
    const next = tpl.body.slice(0, s) + `{${ph}}` + tpl.body.slice(e)
    setTpl({ ...tpl, body: next })
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + ph.length + 2 })
  }
  const saveTpl = () => run('tpl', async () => {
    const r = await post('/api/mail/templates', tpl)
    setTemplates(r.templates); setTpl({ ...tpl, id: r.id }); say('tpl', 'Template saved.')
  })
  const delTpl = () => run('tpl', async () => {
    const r = await fetch(`/api/mail/templates/${tpl.id}`, { method: 'DELETE' }).then(json)
    setTemplates(r.templates); setTpl({ id: null, ...STARTER }); say('tpl', 'Template deleted.')
  })
  const importText = (text) => run('tpl', async () => {
    const r = await post('/api/mail/split', { text })
    setTpl({ ...tpl, id: null, name: tpl.name || 'Imported mail', subject: r.subject || tpl.subject, body: r.body })
    setImporting(false)
    say('tpl', 'Mail imported. Swap real names and details for {placeholders}, or use "Rewrite for this JD" in step 2.')
  })

  // 2. JD
  const readJd = () => run('jd', async () => { const r = await post('/api/mail/jd', { jd }); setDetails(r.details) })
  const rewrite = () => run('rewrite', async () => {
    const r = await post('/api/mail/rewrite', { subject: tpl.subject, body: tpl.body, jd })
    setUndo({ subject: tpl.subject, body: tpl.body })
    setTpl({ ...tpl, subject: r.subject, body: r.body })
    // Always re-read the new JD: its details are what fill the placeholders.
    const d = await post('/api/mail/jd', { jd }); setDetails(d.details); setMessages(null)
    say('rewrite', r.provider === 'offline'
      ? `${r.note ? r.note + ' ' : ''}${r.swapped?.length ? `Swapped the old ${r.swapped.map((x) => `{${x}}`).join(', ')} for placeholders` : 'No old job details found to swap; add {placeholders} by hand'}. The new JD fills them below. Check step 1, or undo.`
      : 'Template rewritten for this JD with AI. Check it in step 1, or undo.')
  })

  // 3. Recipients
  const [who, setWho] = useState('')
  const resolve = (payload) => run('who', async () => {
    const r = await post('/api/mail/recipients', payload)
    const seen = new Set(recipients.map((x) => (x.email || x.input).toLowerCase()))
    setRecipients([...recipients, ...r.recipients.filter((x) => !seen.has((x.email || x.input).toLowerCase()))])
    if (r.summary) say('who', r.summary)
    setWho(''); setMessages(null)
  })
  const updateR = (i, patch) => { setRecipients(recipients.map((r, k) => (k === i ? { ...r, ...patch } : r))); setMessages(null) }
  const ready = recipients.filter((r) => r.status === 'ok' && r.email)

  // 4. Preview
  const preview = () => run('preview', async () => {
    const r = await post('/api/mail/preview', { subject: tpl.subject, body: tpl.body, details, recipients: ready })
    setMessages(r.messages.map((m) => ({ ...m, include: true })))
    requestAnimationFrame(() => document.getElementById('step-4')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  })

  return (
    <div className="page mail-page">
      <header className="hero">
        <p className="eyebrow">Outreach · Mail drop</p>
        <h1>One template, <em>every candidate,</em> personal.</h1>
        <p className="lede">Reuse your best mail, adapt it to a new JD, pull emails from memory and resumes, check every mail, then send from your own Outlook or Gmail.</p>
      </header>

      {/* 1. Template */}
      <section className="mail-step" style={{ '--d': '0ms' }}>
        <StepHead n="01" title="Template" hint="Use {placeholders} for anything that changes per role or person." />
        <div className="tpl-bar">
          <select value={tpl.id || ''} onChange={(e) => { const t = templates.find((x) => x.id === Number(e.target.value)); setTpl(t ? { ...t } : { id: null, ...STARTER }); setUndo(null); setMessages(null) }} aria-label="Saved templates">
            <option value="">+ New template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="ghost" onClick={() => setImporting(!importing)}><ClipboardPaste size={16} /> Import an old mail</button>
        </div>
        {importing && <ImportMail onText={importText} busy={busy === 'tpl'} />}
        <label className="field"><span>Template name</span><input className="txt" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="e.g. Java openings – first touch" /></label>
        <label className="field"><span>Subject</span><input className="txt" value={tpl.subject} onChange={(e) => { setTpl({ ...tpl, subject: e.target.value }); setMessages(null) }} /></label>
        <label className="field"><span>Mail</span><textarea ref={body} rows={11} value={tpl.body} onChange={(e) => { setTpl({ ...tpl, body: e.target.value }); setMessages(null) }} /></label>
        <div className="ph-row">
          <span className="muted">Insert:</span>
          {['firstName', 'name', 'role', 'company', 'skills', 'experience', 'location', 'notice', 'salary'].map((p) => <button key={p} className="ph" onClick={() => insert(p)}>{`{${p}}`}</button>)}
        </div>
        <div className="row-gap">
          <button className="cta small" disabled={busy === 'tpl' || !tpl.body.trim()} onClick={saveTpl}><Save size={16} /> {tpl.id ? 'Save changes' : 'Save template'}</button>
          {tpl.id && <button className="ghost danger" onClick={delTpl} aria-label="Delete template"><Trash2 size={16} /></button>}
          {undo && <button className="ghost" onClick={() => { setTpl({ ...tpl, ...undo }); setUndo(null) }}><Undo2 size={16} /> Undo rewrite</button>}
        </div>
        <Note n={note} step={['tpl']} />
      </section>

      {/* 2. JD */}
      <section className="mail-step" style={{ '--d': '80ms' }}>
        <StepHead n="02" title="New job" hint="Paste the JD. Its details fill the placeholders." />
        <textarea rows={5} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Senior Java Developer, Hyderabad. 4–7 years. Java, Spring Boot, Kafka, AWS. Client: Infosys. Notice: immediate to 30 days." aria-label="Job description" />
        <div className="row-gap">
          <button className="ghost" disabled={!jd.trim() || !!busy} onClick={readJd}>{busy === 'jd' ? <Loader2 className="spin" size={16} /> : <Search size={16} />} Read details</button>
          <button className="cta small" disabled={!jd.trim() || !tpl.body.trim() || !!busy} onClick={rewrite} title={aiReady ? 'Rewrites with AI' : 'Works offline: swaps the old job details for placeholders'}>
            {busy === 'rewrite' ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />} Rewrite template for this JD
          </button>
        </div>
        <div className="fields details">
          {Object.entries(DETAIL_LABELS).map(([k, label]) => (
            <label key={k} className={`fld ${details[k] ? '' : 'empty'}`}><span>{label} <code>{`{${k}}`}</code></span>
              <input value={details[k]} onChange={(e) => { setDetails({ ...details, [k]: e.target.value }); setMessages(null) }} />
            </label>
          ))}
        </div>
        <Note n={note} step={['jd', 'rewrite']} />
      </section>

      {/* 3. Recipients */}
      <section className="mail-step" style={{ '--d': '160ms' }}>
        <StepHead n="03" title="Who gets it" hint="Type names or emails, or pick a group from memory." />
        <div className="quick">
          {[['All selected', 'selected'], ['On hold', 'on hold'], ['Moderate', 'moderate'], ['In process', 'in process']].map(([label, q]) => (
            <button key={q} className="ph" disabled={!!busy} onClick={() => resolve({ q })}><Users size={14} /> {label}</button>
          ))}
        </div>
        <textarea rows={3} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Names or emails"
          placeholder={'Rahul Sharma, Anita Verma\nkiran@example.com\nor a question: selected for Infosys this month'} />
        <div className="row-gap">
          <button className="ghost" disabled={!who.trim() || !!busy} onClick={() => resolve(/\b(selected|rejected|hold|moderate|process|for|this|last|month|week)\b/i.test(who) && !/[,\n@]/.test(who) ? { q: who } : { text: who })}>
            {busy === 'who' ? <Loader2 className="spin" size={16} /> : <Search size={16} />} Find emails
          </button>
          {recipients.length > 0 && <button className="link" onClick={() => { setRecipients([]); setMessages(null) }}>Clear list</button>}
        </div>
        <Note n={note} step={['who']} />
        {recipients.length > 0 && (
          <ul className="recips">
            {recipients.map((r, i) => <Recipient key={r.input + i} r={r} onChange={(p) => updateR(i, p)} onRemove={() => { setRecipients(recipients.filter((_, k) => k !== i)); setMessages(null) }} />)}
          </ul>
        )}
        {recipients.length > 0 && <p className="muted">{ready.length} of {recipients.length} ready{recipients.length > ready.length ? ' · fix the highlighted ones or remove them' : ''}</p>}
      </section>

      {/* 4. Preview & send */}
      <section id="step-4" className="mail-step" style={{ '--d': '240ms' }}>
        <StepHead n="04" title="Check and send" hint="Nothing goes out until you confirm." />
        <div className="row-gap">
          <button className="cta small" disabled={!ready.length || !tpl.body.trim() || !!busy} onClick={preview}>
            {busy === 'preview' ? <Loader2 className="spin" size={16} /> : <MailIcon size={16} />} Preview {ready.length || ''} mail{ready.length === 1 ? '' : 's'}
          </button>
          <button className="ghost" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Send settings</button>
        </div>
        <Note n={note} step={['preview']} />
        {messages && <Outbox messages={messages} setMessages={setMessages} role={details.role} onSettings={() => setShowSettings(true)} />}
        <MailLog />
      </section>

      {showSettings && <SendSettings onClose={() => setShowSettings(false)} />}
    </div>
  )
}

const StepHead = ({ n, title, hint }) => (
  <div className="step-head"><span className="step">{n}</span><div><h2>{title}</h2><p className="muted">{hint}</p></div></div>
)
const Note = ({ n, step }) => (n && step.includes(n.step) ? <p className={`status ${n.bad ? 'bad' : 'ok'}`} role="status">{n.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {n.text}</p> : null)

function ImportMail({ onText, busy }) {
  const [text, setText] = useState('')
  return (
    <div className="import-mail">
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste a mail you sent before (Subject: line optional)'} aria-label="Old mail text" />
      <div className="row-gap"><button className="ghost" disabled={!text.trim() || busy} onClick={() => onText(text)}>Use this text</button></div>
      <p className="muted">or read it from a screenshot of Outlook:</p>
      <ImageOCR onText={onText} hint="A screenshot of the mail in Outlook or Gmail" />
    </div>
  )
}

function Recipient({ r, onChange, onRemove }) {
  const [email, setEmail] = useState('')
  const valid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)
  return (
    <li className={`recip ${r.status}`}>
      <div className="recip-main">
        {r.status === 'ok' ? <CircleCheck size={18} className="ok-ic" /> : <AlertTriangle size={18} className="warn-ic" />}
        <div>
          <strong>{r.name || r.email}</strong>
          <span className="muted">
            {r.status === 'ok' && `${r.email}${r.source === 'resume' ? ' · from resume' : r.source === 'typed' ? '' : ' · from memory'}`}
            {r.status === 'noemail' && 'In memory, but no email saved'}
            {r.status === 'notfound' && `“${r.input}” is not in memory or resumes`}
            {r.status === 'choose' && 'More than one person matches. Which one?'}
          </span>
        </div>
        <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${r.name}`}><X size={16} /></button>
      </div>
      {r.status === 'choose' && (
        <div className="pills col">
          {r.options.map((o) => <button key={o.label} onClick={() => onChange(o.email ? { status: 'ok', name: o.name, email: o.email, candidateId: o.candidateId } : { status: 'noemail', name: o.name, candidateId: o.candidateId })}>{o.label}</button>)}
        </div>
      )}
      {(r.status === 'noemail' || r.status === 'notfound') && (
        <form className="add-email" onSubmit={(e) => { e.preventDefault(); if (valid) onChange({ status: 'ok', email: email.trim(), source: 'typed' }) }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Type their email" aria-label={`Email for ${r.name}`} />
          <button className="ghost" disabled={!valid}>Add</button>
        </form>
      )}
    </li>
  )
}

function Outbox({ messages, setMessages, role, onSettings }) {
  const [open, setOpen] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [state, setState] = useState(null) // {busy} | {results} | {err} | {drafts} | {outlook}
  const [ms, setMs] = useState(null)
  useEffect(() => { fetch('/api/mail/outlook').then(json).then(setMs).catch(() => {}) }, [])
  const viaOutlook = ms?.connected && ms.method === 'microsoft'
  const chosen = messages.filter((m) => m.include)
  const gaps = chosen.filter((m) => m.missing.length)
  const missing = [...new Set(gaps.flatMap((m) => m.missing))]
  const upd = (i, p) => setMessages(messages.map((m, k) => (k === i ? { ...m, ...p } : m)))

  async function send() {
    setConfirm(false); setState({ busy: 'send' })
    try { const r = await post('/api/mail/send', { confirm: true, role, messages: chosen }); setState({ results: r.results }) }
    catch (e) { setState({ err: e.message }) }
  }
  async function outlookDrafts() {
    setState({ busy: 'outlook' })
    try { const r = await post('/api/mail/outlook/drafts', { role, messages: chosen }); setState({ outlook: r.results }) }
    catch (e) { setState({ err: e.message }) }
  }
  async function drafts() {
    setState({ busy: 'drafts' })
    try {
      const res = await fetch('/api/mail/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, messages: chosen }) })
      if (!res.ok) throw new Error((await res.json()).error)
      const url = URL.createObjectURL(await res.blob())
      Object.assign(document.createElement('a'), { href: url, download: res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'outlook-drafts.zip' }).click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setState({ drafts: chosen.length })
    } catch (e) { setState({ err: e.message }) }
  }

  return (
    <div className="outbox">
      {missing.length > 0 && (
        <p className="status bad"><AlertTriangle size={16} />
          <span>Empty {missing.map((m) => `{${m}}`).join(', ')} in {gaps.length === chosen.length ? 'every mail' : gaps.slice(0, 4).map((m) => m.name || m.email).join(', ') + (gaps.length > 4 ? ` +${gaps.length - 4}` : '')}.
            {missing.some((m) => m === 'firstName' || m === 'name') && ' No name means the greeting says “Hi there”.'} Fill details in step 2, or edit the mails below.</span>
        </p>
      )}
      <ul>
        {messages.map((m, i) => (
          <li key={m.email + i} className={`mail-item ${open === i ? 'open' : ''} ${m.include ? '' : 'off'}`} style={{ '--i': i }}>
            <div className="mail-row">
              <input type="checkbox" checked={m.include} onChange={(e) => upd(i, { include: e.target.checked })} aria-label={`Include ${m.name}`} />
              <button className="mail-sum" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <strong>{m.name || m.email}</strong><span className="muted">{m.email}</span><span className="subj">{m.subject}</span>
                <ChevronDown size={16} className="chev" />
              </button>
            </div>
            {open === i && (
              <div className="mail-edit">
                <input className="txt" value={m.subject} onChange={(e) => upd(i, { subject: e.target.value })} aria-label="Subject" />
                <textarea rows={10} value={m.body} onChange={(e) => upd(i, { body: e.target.value })} aria-label="Mail body" />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="send-bar">
        {ms?.connected && <button className="ghost" disabled={!chosen.length || !!state?.busy} onClick={outlookDrafts}>{state?.busy === 'outlook' ? <Loader2 className="spin" size={16} /> : <Inbox size={16} />} Put drafts in my Outlook</button>}
        <button className="ghost" disabled={!chosen.length || !!state?.busy} onClick={drafts}>{state?.busy === 'drafts' ? <Loader2 className="spin" size={16} /> : <Download size={16} />} Drafts as files (.zip)</button>
        <button className="cta small" disabled={!chosen.length || !!state?.busy} onClick={() => setConfirm(true)}>{state?.busy === 'send' ? <Loader2 className="spin" size={16} /> : <Send size={16} />} Send {chosen.length} now</button>
      </div>
      <p className="muted small-note">{viaOutlook ? <>“Send now” sends from your Outlook <b>{ms.account?.email}</b>; copies appear in your Sent Items.</> : ms?.connected ? 'Outlook is connected; “Send now” uses the app-password account (switch in Send settings).' : <>Not signed in to Outlook yet: <button className="link" onClick={onSettings}>Sign in with Microsoft</button> to send or create drafts straight from your mailbox. “Drafts as files” works with no setup: unzip and double-click each file.</>}</p>

      {confirm && (
        <div className="confirm-box" role="alertdialog" aria-label="Confirm sending">
          <p><strong>Send {chosen.length} mail{chosen.length > 1 ? 's' : ''} now{viaOutlook ? ` from ${ms.account?.email}` : ''}?</strong> To: {chosen.slice(0, 5).map((m) => m.name || m.email).join(', ')}{chosen.length > 5 ? ` and ${chosen.length - 5} more` : ''}. They go out one by one, about 1.5 seconds apart.</p>
          <div className="row-gap"><button className="cta small" onClick={send}><Send size={16} /> Yes, send</button><button className="ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
        </div>
      )}
      {state?.busy === 'send' && <p className="muted"><Loader2 className="spin" size={16} /> Sending… keep this page open.</p>}
      {state?.err && <p className="status bad"><AlertTriangle size={16} /> {state.err}{/account|settings/i.test(state.err) && <button className="link" onClick={onSettings}> Open send settings</button>}</p>}
      {state?.drafts && <p className="status ok"><Check size={16} /> {state.drafts} draft{state.drafts > 1 ? 's' : ''} downloaded.</p>}
      {state?.outlook && (
        <div className="results-list">
          <p className={`status ${state.outlook.every((r) => r.ok) ? 'ok' : 'bad'}`}>{state.outlook.filter((r) => r.ok).length} draft{state.outlook.length === 1 ? '' : 's'} created in your Outlook Drafts folder. Open Outlook, check them and press Send.</p>
          <ul>{state.outlook.map((r, i) => <li key={i}>{r.ok ? <CircleCheck size={16} className="ok-ic" /> : <CircleX size={16} className="bad-ic" />} {r.name || r.email} {r.link ? <a className="muted" href={r.link} target="_blank" rel="noreferrer">open</a> : <span className="muted">{r.error}</span>}</li>)}</ul>
        </div>
      )}
      {state?.results && (
        <div className="results-list">
          <p className={`status ${state.results.every((r) => r.ok) ? 'ok' : 'bad'}`}>{state.results.filter((r) => r.ok).length} sent, {state.results.filter((r) => !r.ok).length} failed.</p>
          <ul>{state.results.map((r, i) => <li key={i}>{r.ok ? <CircleCheck size={16} className="ok-ic" /> : <CircleX size={16} className="bad-ic" />} {r.name || r.email} <span className="muted">{r.ok ? r.email : r.error}</span></li>)}</ul>
        </div>
      )}
    </div>
  )
}

function MailLog() {
  const [log, setLog] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open) fetch('/api/mail/log').then(json).then((r) => setLog(r.log)) }, [open])
  return (
    <details className="mail-log" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Mail history</summary>
      {!log ? <Loader2 className="spin" size={16} /> : !log.length ? <p className="muted">Nothing sent or drafted yet.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>To</th><th>Subject</th><th>How</th><th>Result</th></tr></thead>
          <tbody>{log.map((m) => <tr key={m.id}><td>{m.createdAt.slice(0, 16)}</td><td><strong>{m.name}</strong><span className="file">{m.email}</span></td><td className="wrap">{m.subject}</td><td>{{ smtp: 'Sent (app password)', outlook: 'Sent (Outlook)', 'outlook-draft': 'Outlook draft' }[m.method] || m.method}</td><td>{m.status === 'failed' ? <span className="status bad">{m.error}</span> : m.status}</td></tr>)}</tbody>
        </table></div>
      )}
    </details>
  )
}

function SmtpSettings() {
  const [s, setS] = useState(null)
  const [presets, setPresets] = useState({})
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/mail/smtp').then(json).then((r) => { setS(r.smtp); setPresets(r.presets) }) }, [])
  const pick = (p) => setS({ ...s, preset: p, ...(p !== 'custom' ? { host: presets[p].host, port: presets[p].port, secure: presets[p].secure } : {}) })
  async function save(test) {
    setBusy(true); setMsg(null)
    try {
      const r = await post('/api/mail/smtp', { ...s, ...(pass ? { pass } : {}) })
      setS(r.smtp); setPass('')
      if (test) { await post('/api/mail/smtp/test', {}); setMsg({ text: 'Connected. Your account is ready to send.' }) } else setMsg({ text: 'Saved.' })
    } catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <>
        {!s ? <Loader2 className="spin" /> : (
          <div className="smtp-form">
            <div className="pills">{Object.entries(presets).map(([k, p]) => <button key={k} className={s.preset === k ? 'on' : ''} onClick={() => pick(k)}>{p.label}</button>)}</div>
            <label className="field"><span>Your email</span><input className="txt" type="email" value={s.user} onChange={(e) => setS({ ...s, user: e.target.value })} placeholder="you@company.com" autoComplete="off" /></label>
            <label className="field"><span>App password {s.hasPassword && <em className="muted">(saved; type to replace)</em>}</span><input className="txt" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder={s.hasPassword ? '••••••••' : 'App password, not your normal password'} /></label>
            <label className="field"><span>Name shown to candidates</span><input className="txt" value={s.fromName} onChange={(e) => setS({ ...s, fromName: e.target.value })} placeholder="Priya – Talent Acquisition" /></label>
            {s.preset === 'custom' && (
              <div className="fields">
                <label className="fld"><span>Server</span><input value={s.host} onChange={(e) => setS({ ...s, host: e.target.value })} /></label>
                <label className="fld"><span>Port</span><input value={s.port} onChange={(e) => setS({ ...s, port: e.target.value })} /></label>
                <label className="confirm"><input type="checkbox" checked={s.secure} onChange={(e) => setS({ ...s, secure: e.target.checked })} /> SSL (port 465)</label>
              </div>
            )}
            <div className="help">
              <p><b>Gmail:</b> Google Account → Security → 2-Step Verification → App passwords → create one.</p>
              <p><b>Outlook / Microsoft 365:</b> your IT admin must allow “Authenticated SMTP” for your mailbox; then use an app password from Microsoft account → Security. If your company blocks this, use Outlook drafts instead.</p>
              <p className="muted">The password is stored only on this computer and is never shown again.</p>
            </div>
            <div className="row-gap">
              <button className="cta small" disabled={busy || !s.user} onClick={() => save(true)}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save & test</button>
              <button className="ghost" disabled={busy} onClick={() => save(false)}>Save</button>
            </div>
            {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
          </div>
        )}
    </>
  )
}

function SendSettings({ onClose }) {
  const [tab, setTab] = useState('ms')
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Send settings" onClick={(e) => e.stopPropagation()}>
        <header><div><h2>Send settings</h2><p className="muted">How TalentDesk sends for you. “Drafts as files” works without any of this.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="mode-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'ms'} className={tab === 'ms' ? 'on' : ''} onClick={() => setTab('ms')}>Microsoft (Outlook)</button>
          <button role="tab" aria-selected={tab === 'smtp'} className={tab === 'smtp' ? 'on' : ''} onClick={() => setTab('smtp')}>App password</button>
        </div>
        <div className="tab-body">{tab === 'ms' ? <MicrosoftPanel /> : <SmtpSettings />}</div>
      </aside>
    </div>
  )
}

const AZURE_STEPS = [
  <>Open <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">Microsoft Entra → App registrations</a> (sign in with your Outlook or work account) and click <b>New registration</b>.</>,
  <>Name it <b>TalentDesk</b>. Supported account types: <b>Accounts in any organizational directory and personal Microsoft accounts</b>. Leave Redirect URI empty. Click <b>Register</b>.</>,
  <>Copy the <b>Application (client) ID</b> shown on the next page.</>,
  <>Open <b>Authentication</b> → Advanced settings → set <b>Allow public client flows</b> to <b>Yes</b> → Save.</>,
  <>Open <b>API permissions</b> → Add a permission → Microsoft Graph → Delegated → tick <b>Mail.Send</b>, <b>Mail.ReadWrite</b>, <b>User.Read</b>, <b>offline_access</b> → Add. Work accounts may also need <b>Grant admin consent</b>.</>,
  <>Paste the Client ID below and click <b>Sign in with Microsoft</b>.</>,
]

function MicrosoftPanel() {
  const [st, setSt] = useState(null)
  const [clientId, setClientId] = useState('')
  const [tenant, setTenant] = useState('common')
  const [code, setCode] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const load = () => fetch('/api/mail/outlook').then(json).then((r) => { setSt(r); setClientId((c) => c || r.clientId); setTenant(r.tenant || 'common') }).catch((e) => setMsg({ bad: true, text: e.message }))
  useEffect(() => { load() }, [])
  // While a code is shown, ask the server every few seconds whether Microsoft has approved it.
  useEffect(() => {
    if (!code) return
    let stop = false, t
    const tick = async () => {
      try {
        const r = await post('/api/mail/outlook/poll', {})
        if (stop) return
        if (r.status === 'connected') { setCode(null); setMsg({ text: `Connected as ${r.account.email}. Mails will now be sent from this Outlook.` }); load(); return }
        t = setTimeout(tick, (code.interval || 5) * 1000)
      } catch (e) { if (!stop) { setCode(null); setMsg({ bad: true, text: e.message }) } }
    }
    t = setTimeout(tick, (code.interval || 5) * 1000)
    return () => { stop = true; clearTimeout(t) }
  }, [code])

  async function start() {
    setBusy(true); setMsg(null)
    try { setCode(await post('/api/mail/outlook/start', { clientId, tenant })) } catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(code.userCode); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  const disconnect = async () => { await post('/api/mail/outlook/disconnect', {}); setMsg(null); load() }
  const setMethod = async (method) => { await post('/api/mail/method', { method }); load() }
  if (!st) return msg ? <p className="status bad"><AlertTriangle size={16} /> {msg.text}</p> : <Loader2 className="spin" />

  if (st.connected) return (
    <div className="smtp-form">
      <div className="ms-connected">
        <span className="ms-logo" aria-hidden="true"><i /><i /><i /><i /></span>
        <div><b>{st.account?.name || 'Outlook'}</b><small className="muted">{st.account?.email}</small></div>
        <span className="pill live"><i aria-hidden="true" />Connected</span>
      </div>
      <label className="confirm"><input type="checkbox" checked={st.method === 'microsoft'} onChange={(e) => setMethod(e.target.checked ? 'microsoft' : 'smtp')} /> Use this Outlook for “Send now”</label>
      <p className="muted">TalentDesk holds only a sign-in token (never your password) and renews it automatically. You can also put mails straight into your Outlook Drafts.</p>
      {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
      <div className="row-gap"><button className="ghost danger" onClick={disconnect}>Disconnect</button></div>
    </div>
  )

  return (
    <div className="smtp-form">
      {code ? (
        <div className="ms-code">
          <p><b>1.</b> Copy this code</p>
          <div className="code-box"><b>{code.userCode}</b><button className="ghost" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button></div>
          <p><b>2.</b> Open Microsoft’s page, paste the code and approve TalentDesk</p>
          <a className="cta small" href={code.verificationUri} target="_blank" rel="noreferrer">Open microsoft.com/devicelogin <ExternalLink size={14} /></a>
          <p className="muted waiting"><Loader2 className="spin" size={14} /> Waiting for you to approve… this updates by itself.</p>
          <button className="link" onClick={() => setCode(null)}>Cancel</button>
        </div>
      ) : (<>
        <p className="muted">Sign in once with your Outlook / Microsoft 365 account. TalentDesk then sends mails and creates drafts from your own mailbox, using Microsoft’s secure sign-in (a token, never your password).</p>
        <details className="restore" open={!st.clientId}>
          <summary>One-time setup: get your Client ID (about 3 minutes)</summary>
          <ol>{AZURE_STEPS.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </details>
        <label className="field"><span>Application (client) ID</span><input className="txt" value={clientId} onChange={(e) => setClientId(e.target.value.trim())} placeholder="1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d" spellCheck="false" /></label>
        <label className="field"><span>Account type</span>
          <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
            <option value="common">Work or personal (recommended)</option>
            <option value="organizations">Work / school only (Microsoft 365)</option>
            <option value="consumers">Personal only (outlook.com, hotmail)</option>
          </select>
        </label>
        <button className="cta small" disabled={busy || !clientId} onClick={start}>{busy ? <Loader2 className="spin" size={16} /> : <span className="ms-logo sm" aria-hidden="true"><i /><i /><i /><i /></span>} Sign in with Microsoft</button>
        {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
      </>)}
    </div>
  )
}
