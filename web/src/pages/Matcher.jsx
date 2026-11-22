import { useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, X, Sparkles, Download, AlertTriangle, Loader2, Bot } from 'lucide-react'

const BUCKETS = [
  { key: 'strong', title: 'Strong match', hint: (s) => `${s}% and above` },
  { key: 'moderate', title: 'Moderate match', hint: (s, m) => `${m}% to ${s - 1}%` },
  { key: 'weak', title: 'Weak or not relevant', hint: (_, m) => `below ${m}%` },
]
const ACCEPT = '.pdf,.docx,.txt'

export default function Matcher() {
  const [files, setFiles] = useState([])
  const [jd, setJd] = useState('')
  const [jdFile, setJdFile] = useState(null)
  const [strong, setStrong] = useState(90)
  const [moderate, setModerate] = useState(60)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [useAI, setUseAI] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const input = useRef()
  useEffect(() => {
    fetch('/api/ai/config').then((r) => r.json())
      .then((c) => { const on = Object.values(c.providers).some((p) => p.enabled); setAiReady(on); setUseAI(on) })
      .catch(() => {})
  }, [])

  const addFiles = (list) => {
    const ok = [...list].filter((f) => /\.(pdf|docx|txt)$/i.test(f.name))
    setFiles((cur) => [...cur, ...ok.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))])
    if (ok.length < list.length) setError('Some files were skipped: only PDF, DOCX and TXT are supported.')
  }

  async function run() {
    setError(''); setBusy(true)
    const body = new FormData()
    files.forEach((f) => body.append('resumes', f))
    body.append('jd', jd)
    if (jdFile) body.append('jdFile', jdFile)
    body.append('strong', strong); body.append('moderate', moderate)
    body.append('useAI', String(useAI && aiReady))
    try {
      const res = await fetch('/api/match', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Matching failed')
      setData(json)
      requestAnimationFrame(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  // Thresholds re-bucket instantly on the client; no need to re-upload.
  const rows = data?.results.map((r) => ({ ...r, bucket: r.score >= strong ? 'strong' : r.score >= moderate ? 'moderate' : 'weak' })) || []

  async function exportXlsx() {
    const res = await fetch('/api/export/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: rows }) })
    const url = URL.createObjectURL(await res.blob())
    Object.assign(document.createElement('a'), { href: url, download: 'resume-matches.xlsx' }).click()
    URL.revokeObjectURL(url)
  }

  const canRun = files.length && (jd.trim() || jdFile) && !busy

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Step 1 · Screening</p>
        <h1>Match every resume <em>to the role</em>, in one pass.</h1>
        <p className="lede">Drop in a stack of resumes and the job description. You get three ranked lists with name, phone and email, ready to call.</p>
      </header>

      <section className="intake">
        <div className={`drop ${drag ? 'drag' : ''} ${files.length ? 'has' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}>
          <div className="panel-head"><span className="step">01</span><h2>Resumes</h2><span className="count">{files.length || ''}</span></div>
          <button className="drop-zone" onClick={() => input.current.click()}>
            <UploadCloud size={30} aria-hidden="true" />
            <strong>Drop resumes here or click to browse</strong>
            <span>PDF, DOCX or TXT · up to 500 files</span>
          </button>
          <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          {files.length > 0 && (
            <ul className="chips">
              {files.map((f, i) => (
                <li key={f.name + f.size} className="chip" style={{ '--i': i }}>
                  <FileText size={14} aria-hidden="true" /><span>{f.name}</span>
                  <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))}><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && <button className="link" onClick={() => setFiles([])}>Clear all</button>}
        </div>

        <div className="jd">
          <div className="panel-head"><span className="step">02</span><h2>Job description</h2></div>
          <label className="sr" htmlFor="jd">Job description</label>
          <textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the JD: role, required skills, years of experience, location…" />
          <div className="jd-foot">
            <label className="file-btn">
              <FileText size={15} aria-hidden="true" /> {jdFile ? jdFile.name : 'Or upload JD file'}
              <input type="file" accept={ACCEPT} hidden onChange={(e) => setJdFile(e.target.files[0] || null)} />
            </label>
            {jdFile && <button className="link" onClick={() => setJdFile(null)}>Remove</button>}
          </div>
        </div>
      </section>

      <section className="controls">
        <Range label="Strong match from" value={strong} min={moderate + 1} max={100} onChange={setStrong} />
        <Range label="Moderate match from" value={moderate} min={1} max={strong - 1} onChange={setModerate} />
        <label className="switch">
          <input type="checkbox" checked={useAI && aiReady} disabled={!aiReady} onChange={(e) => setUseAI(e.target.checked)} />
          <span>Refine with AI<small>{aiReady ? 'Re-scores the top 40 and explains why' : 'Add a key in AI Settings to enable'}</small></span>
        </label>
        <button className="cta" disabled={!canRun} onClick={run}>
          {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          {busy ? (useAI && aiReady ? 'Reading and AI-scoring…' : `Reading ${files.length} resumes…`) : 'Run match'}
        </button>
      </section>

      {error && <p className="alert" role="alert"><AlertTriangle size={16} /> {error}</p>}

      {data && (
        <section id="results" className="results">
          <div className="results-head">
            <div>
              <h2>Results</h2>
              <p className="muted">
                Must-have: {data.jd.skills.filter((s) => !data.jd.niceToHave.includes(s)).join(', ') || 'none recognised, scored on keywords'}
                {data.jd.niceToHave.length > 0 && ` · Good to have: ${data.jd.niceToHave.join(', ')}`}
                {data.jd.minYears ? ` · ${data.jd.minYears}${data.jd.maxYears ? `–${data.jd.maxYears}` : '+'} yrs` : ''}
              </p>
            </div>
            <button className="ghost" onClick={exportXlsx}><Download size={16} /> Export to Excel</button>
          </div>

          {data.ai?.used && <p className="note"><Bot size={16} /> AI re-scored {data.ai.scored} resumes with {{ groq: 'Groq', nvidia: 'NVIDIA', openrouter: 'OpenRouter (Nemotron)' }[data.ai.provider] || data.ai.provider}. The final score is 60% AI and 40% offline.</p>}
          {data.ai?.error && <p className="alert" role="alert"><AlertTriangle size={16} /> {data.ai.error}</p>}

          <div className="tally">
            {BUCKETS.map((b) => (
              <a key={b.key} href={`#t-${b.key}`} className={`tally-card ${b.key}`}>
                <span className="tally-n">{rows.filter((r) => r.bucket === b.key).length}</span>
                <span>{b.title}</span>
              </a>
            ))}
          </div>

          {BUCKETS.map((b) => {
            const list = rows.filter((r) => r.bucket === b.key)
            return (
              <div key={b.key} id={`t-${b.key}`} className={`table-card ${b.key}`}>
                <div className="table-title"><h3>{b.title}</h3><span className="muted">{b.hint(strong, moderate)} · {list.length}</span></div>
                {list.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Match</th><th>Name</th><th>Phone</th><th>Email</th><th>Exp</th><th>Skills matched / missing</th></tr></thead>
                      <tbody>
                        {list.map((r, i) => (
                          <tr key={r.id + r.filename} style={{ '--i': i }}>
                            <td><Score value={r.score} /></td>
                            <td>
                              <strong>{r.name || '—'}{r.aiScore != null && <span className="ai-badge" title={`Offline ${r.offlineScore} · AI ${r.aiScore}`}>AI {r.aiScore}</span>}</strong>
                              <span className="file">{r.filename}</span>
                              {r.aiReason && <span className="ai-reason">{r.aiReason}</span>}
                            </td>
                            <td>{r.phone ? <a href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a> : '—'}</td>
                            <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</td>
                            <td>{r.years ? `${r.years} yrs` : '—'}</td>
                            <td className="skills">
                              {r.matched.map((s) => <span key={s} className="tag ok">{s}</span>)}
                              {r.missing.map((s) => <span key={s} className="tag miss">{s}</span>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="empty">No resumes in this range.</p>}
              </div>
            )
          })}

          {data.failed.length > 0 && (
            <div className="alert">
              <AlertTriangle size={16} />
              <div><strong>{data.failed.length} file(s) could not be read:</strong>
                <ul>{data.failed.map((f) => <li key={f.filename}>{f.filename}: {f.error}</li>)}</ul></div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Range({ label, value, min, max, onChange }) {
  return (
    <label className="range">
      <span>{label} <b>{value}%</b></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function Score({ value }) {
  return (
    <span className="score" style={{ '--v': value }} aria-label={`${value} percent match`}>
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" /><circle className="arc" cx="18" cy="18" r="15.9" /></svg>
      <b>{value}</b>
    </span>
  )
}
