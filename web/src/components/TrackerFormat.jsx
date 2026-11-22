import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, Check, AlertTriangle, Loader2, X, RotateCcw } from 'lucide-react'

const json = async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j }
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json)

/** Choose how exported trackers look: default columns, typed columns, or your own .xlsx template. */
export default function TrackerFormat({ onClose }) {
  const [fmt, setFmt] = useState(null)
  const [fields, setFields] = useState([])
  const [tab, setTab] = useState('default')
  const [typed, setTyped] = useState('')
  const [draft, setDraft] = useState(null) // columns being edited before save
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const file = useRef()

  useEffect(() => {
    fetch('/api/tracker/format').then(json).then((r) => {
      setFmt(r.format); setFields(r.fields); setTab(r.format.type)
      if (r.format.type === 'columns') setTyped(r.format.columns.map((c) => c.header).join(', '))
      if (r.format.type !== 'default') setDraft(r.format.columns)
    }).catch((e) => setMsg({ bad: true, text: e.message }))
  }, [])

  async function run(fn, ok) {
    setBusy(true); setMsg(null)
    try { const r = await fn(); if (r?.format) { setFmt(r.format); setDraft(r.format.type === 'default' ? null : r.format.columns) } if (ok) setMsg({ text: ok }) }
    catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy(false) }
  }
  const preview = () => run(async () => { const r = await post('/api/tracker/columns', { text: typed }); setDraft(r.columns) })
  const saveColumns = () => run(() => post('/api/tracker/format', { type: tab, columns: draft }), 'Saved. New exports use this format.')
  const useDefault = () => run(() => post('/api/tracker/format', { type: 'default' }), 'Using the default columns.')
  const upload = (f) => f && run(async () => {
    const body = new FormData(); body.append('file', f)
    return fetch('/api/tracker/template', { method: 'POST', body }).then(json)
  }, 'Template saved. Check the column matches below.')

  const unmapped = draft?.filter((c) => !c.field).length || 0
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer format-drawer" role="dialog" aria-modal="true" aria-label="Tracker format" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h2>Tracker format</h2><p className="muted">How your Excel trackers are laid out.</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {!fmt ? <Loader2 className="spin" /> : (<>
          <div className="mode-tabs" role="tablist">
            {[['default', 'Default'], ['columns', 'My columns'], ['template', 'My template']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setMsg(null); setDraft(id === fmt.type && id !== 'default' ? fmt.columns : null) }}>{label}</button>
            ))}
          </div>

          {tab === 'default' && (
            <div className="fmt-body">
              <p>S.No, Name, Phone, Email, Client, Role, Status, Date, Notice Period, Current CTC, Expected CTC, Current Location, Job Location, Remarks.</p>
              {fmt.type === 'default' ? <p className="status ok"><Check size={16} /> In use</p> : <button className="cta small" disabled={busy} onClick={useDefault}><RotateCcw size={16} /> Use default</button>}
            </div>
          )}

          {tab === 'columns' && (
            <div className="fmt-body">
              <label className="field"><span>Type your column names, in order</span>
                <textarea rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="S.No, Candidate Name, Mobile, Client, Total Experience, CTC, ECTC, NP, Remarks" />
              </label>
              <button className="ghost" disabled={!typed.trim() || busy} onClick={preview}>Match columns</button>
            </div>
          )}

          {tab === 'template' && (
            <div className="fmt-body">
              <button className="drop-zone small" onClick={() => file.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]) }}>
                <FileSpreadsheet size={26} aria-hidden="true" />
                <strong>{fmt.type === 'template' ? `Using ${fmt.templateName}` : 'Drop your tracker .xlsx here'}</strong>
                <span>Your headers, colours and title rows are kept. Sample rows are replaced.</span>
              </button>
              <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
              {fmt.type === 'template' && <p className="muted">Header row found at row {fmt.headerRow} of sheet “{fmt.sheet}”.</p>}
            </div>
          )}

          {draft && tab !== 'default' && (
            <div className="mapping">
              <h3>Column matches</h3>
              {unmapped > 0 && <p className="muted">{unmapped} column{unmapped > 1 ? 's' : ''} not recognised. Pick a field, or leave “Leave blank” to keep the column empty.</p>}
              <ul>
                {draft.map((c, i) => (
                  <li key={(c.col ?? '') + c.header + i} className={c.field ? '' : 'unmapped'}>
                    <span className="col-name">{c.header}</span>
                    <span aria-hidden="true">→</span>
                    <select value={c.field || ''} aria-label={`Field for ${c.header}`} onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, field: e.target.value || null } : x)))}>
                      <option value="">Leave blank</option>
                      {fields.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <button className="cta small" disabled={busy} onClick={saveColumns}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save format</button>
            </div>
          )}
          {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`} role="status">{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
          {tab === 'template' && !draft && <p className="muted"><Upload size={14} /> Tip: in Excel use File → Save As → Excel Workbook (.xlsx).</p>}
        </>)}
      </aside>
    </div>
  )
}
