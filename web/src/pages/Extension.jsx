import { useEffect, useState } from 'react'
import { Download, FolderOpen, ToggleRight, FolderInput, Pin, KeyRound, ScanSearch, MousePointerClick, Copy, Check, ShieldCheck, ListChecks, Ban } from 'lucide-react'

const STEPS = [
  { icon: Download, title: 'Download', body: 'Click “Download extension” above and unzip the file (right-click → Extract All).' },
  { icon: ToggleRight, title: 'Developer mode', body: <>Open <code>chrome://extensions</code> in Chrome and turn on <b>Developer mode</b> (top right).</> },
  { icon: FolderInput, title: 'Load it', body: <>Click <b>Load unpacked</b> and choose the unzipped <code>talentdesk-extension</code> folder.</> },
  { icon: Pin, title: 'Pin it', body: 'Click the puzzle icon in Chrome’s toolbar and pin TalentDesk Sourcer.' },
  { icon: KeyRound, title: 'Connect it', body: 'Open the extension once and paste your key (copy it from the box above).' },
  { icon: ScanSearch, title: 'Screen a search', body: 'Open Naukri, LinkedIn or any job-board search, enter the job title or JD, skills and experience, and click Start screening.' },
]

export default function Extension() {
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { fetch('/api/auth/extension-key').then((r) => r.json()).then((r) => setKey(r.key || '')).catch(() => {}) }, [])
  const copy = async () => { try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Sourcing · Chrome extension</p>
        <h1>Spend credits only on <em>the right</em> profiles.</h1>
        <p className="lede">The extension screens every result on the search page you have open, against your job title or JD, skills and experience, then shows exactly which profiles to download. It never downloads anything by itself.</p>
      </header>

      <section className="ext-get">
        <div className="ext-get-main">
          <h2>Get the extension</h2>
          <p className="muted">Works in Google Chrome and Microsoft Edge. Free, and only talks to TalentDesk on this computer.</p>
          <a className="cta" href="/api/extension/download" download><Download size={18} /> Download extension (.zip)</a>
        </div>
        <div className="ext-key">
          <span className="muted">Your extension key</span>
          <div className="play-row">
            <input readOnly value={key} aria-label="Extension key" onFocus={(e) => e.target.select()} />
            <button className="ghost" onClick={copy} disabled={!key}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
          <small className="muted">Paste it into the extension once. You can make a new one in Settings.</small>
        </div>
      </section>

      <section className="ext-how">
        <div><ListChecks size={20} /><h3>Your requirements</h3><p>Job title or JD, as many must-have skills as you like, years of experience, salary, notice, last active.</p></div>
        <div><Ban size={20} /><h3>Strict screening</h3><p>On by default: a profile is rejected if even one requirement is missing or not shown. Skills match their common spellings too (k8s = Kubernetes, ReactJS = React).</p></div>
        <div><ShieldCheck size={20} /><h3>Download only the best</h3><p>Matching profiles are marked #1, #2… on the page and listed in the popup. Click a name to jump to it, then download just those.</p></div>
      </section>

      <h2 className="steps-title">Install in two minutes</h2>
      <ol className="steps">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} style={{ '--i': i }}>
            <span className="step-icon"><Icon size={20} aria-hidden="true" /></span>
            <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <p className="muted small-note"><MousePointerClick size={14} /> If a site’s results aren’t found automatically, click <b>Pick a card</b> in the extension and click any one candidate; that layout is remembered. <FolderOpen size={14} /> Keep TalentDesk running while you screen.</p>
    </div>
  )
}
