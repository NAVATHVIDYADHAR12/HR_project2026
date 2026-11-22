import { useEffect, useMemo, useRef, useState } from 'react'
import { Wand2, Loader2, Download, Copy, Check, ImagePlus, Palette, X, AlertTriangle, Type, Send } from 'lucide-react'
import { drawPoster, DESIGNS, SIZES, paletteFromImage } from '../poster/render.js'

const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j }
const FIELDS = [['role', 'Role'], ['company', 'Company / brand'], ['location', 'Location'], ['experience', 'Experience'], ['notice', 'Notice period'], ['salary', 'CTC (optional)']]
const EMPTY = { role: '', company: '', location: '', experience: '', notice: '', salary: '', skills: '', eyebrow: "We're hiring", tagline: '', highlights: '', cta: 'Apply now', contact: '' }

const loadImage = (file) => new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('Could not open that image.')); img.src = URL.createObjectURL(file) })
// Poster fonts must be loaded before drawing, or the canvas silently falls back to a default font.
const fontsReady = Promise.all(['600 100px Cormorant', 'italic 500 40px Cormorant', '800 100px Manrope', '700 30px Manrope', '500 30px Manrope'].map((f) => document.fonts.load(f))).catch(() => {})

export default function Poster() {
  const [jd, setJd] = useState('')
  const [f, setF] = useState(EMPTY)
  const [design, setDesign] = useState('noir')
  const [size, setSize] = useState('portrait')
  const [refPalette, setRefPalette] = useState(null)
  const [useRefColors, setUseRef] = useState(false)
  const [refPreview, setRefPreview] = useState('')
  const [accent, setAccent] = useState('')
  const [logo, setLogo] = useState(null)
  const [caption, setCaption] = useState('')
  const [aiReady, setAiReady] = useState(false)
  const [useAI, setUseAI] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(false)
  const canvas = useRef()
  const thumbs = useRef({})

  useEffect(() => {
    fetch('/api/ai/config').then(json).then((c) => { const on = Object.values(c.providers).some((p) => p.enabled); setAiReady(on); setUseAI(on) }).catch(() => {})
  }, [])

  const data = useMemo(() => ({
    brand: f.company, eyebrow: f.eyebrow, role: f.role, tagline: f.tagline,
    skills: f.skills.split(/\s*,\s*/).filter(Boolean),
    details: [['Experience', f.experience], ['Location', f.location], ['Notice', f.notice], ['CTC', f.salary]],
    highlights: f.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
    cta: f.cta, contact: f.contact,
  }), [f])
  const palette = useMemo(() => ({ ...(useRefColors && refPalette ? refPalette : {}), ...(accent ? { accent } : {}) }), [useRefColors, refPalette, accent])

  // Redraw on any change (fonts first). Thumbnails show every design with the same content.
  useEffect(() => {
    let live = true
    fontsReady.then(() => {
      if (!live) return
      if (canvas.current) drawPoster(canvas.current, data, { design, size, palette, logo })
      for (const [id, c] of Object.entries(thumbs.current)) if (c) drawPoster(c, data, { design: id, size: 'square', palette, logo })
    })
    return () => { live = false }
  }, [data, design, size, palette, logo])

  async function build() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/poster/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jd, contact: f.contact, useAI: useAI && aiReady }) }).then(json)
      const d = r.details, c = r.copy
      setF({ ...f, role: d.role, company: d.company || f.company, location: d.location, experience: d.experience, notice: d.notice, salary: d.salary, skills: d.skills,
        eyebrow: c.eyebrow, tagline: c.tagline, highlights: c.highlights.join('\n') })
      setCaption(c.caption)
      setMsg(r.ai.error ? { bad: true, text: r.ai.error } : { text: r.ai.used ? 'Poster and caption written with AI. Edit anything below.' : 'Poster filled from the JD. Edit anything below.' })
    } catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy(false) }
  }

  async function onReference(file) {
    if (!file) return
    try { const img = await loadImage(file); setRefPalette(paletteFromImage(img)); setRefPreview(img.src); setUseRef(true); setAccent('') }
    catch (e) { setMsg({ bad: true, text: e.message }) }
  }
  async function onLogo(file) {
    if (!file) return
    try { setLogo(await loadImage(file)) } catch (e) { setMsg({ bad: true, text: e.message }) }
  }
  function download() {
    canvas.current.toBlob((b) => {
      const url = URL.createObjectURL(b)
      const slug = (f.role || 'hiring').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      Object.assign(document.createElement('a'), { href: url, download: `poster-${slug}-${size}.png` }).click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, 'image/png')
  }
  function toLinkedIn() {
    // Hand the poster + caption to the LinkedIn Groups page (same browser), then switch pages.
    try {
      localStorage.setItem('td-linkedin-post', JSON.stringify({ role: [f.role, f.skills].filter(Boolean).join(' – '), caption, image: canvas.current.toDataURL('image/png') }))
      window.dispatchEvent(new CustomEvent('td-nav', { detail: 'linkedin' }))
    } catch { setMsg({ bad: true, text: 'Could not hand over the poster (browser storage is full or blocked). Download it and add it on the LinkedIn page.' }) }
  }
  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { setMsg({ bad: true, text: 'Could not copy. Select the caption and press Ctrl+C.' }) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="page poster-page">
      <header className="hero">
        <p className="eyebrow">Outreach · Poster studio</p>
        <h1>A hiring poster <em>worth sharing.</em></h1>
        <p className="lede">Paste the JD and get a ready poster plus a LinkedIn caption. Pick a design, match a reference poster’s colours, add your logo, download the PNG.</p>
      </header>

      <div className="studio">
        <div className="studio-controls">
          <section className="panel">
            <h2>1 · Job description</h2>
            <textarea rows={6} value={jd} onChange={(e) => setJd(e.target.value)} aria-label="Job description"
              placeholder={'Senior Java Developer – Hyderabad\nExperience: 4–7 years\nMust have: Java, Spring Boot, Kafka, AWS\n- Build payment microservices'} />
            <label className="field"><span>How to apply (email, phone or link)</span><input className="txt" value={f.contact} onChange={set('contact')} placeholder="careers@agency.com · +91 90000 00000" /></label>
            <div className="row-gap">
              <button className="cta small" disabled={!jd.trim() || busy} onClick={build}>{busy ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />} Build poster</button>
              <label className="switch"><input type="checkbox" checked={useAI && aiReady} disabled={!aiReady} onChange={(e) => setUseAI(e.target.checked)} /><span>Catchy words with AI<small>{aiReady ? 'Headline, highlights and caption' : 'Add a key in AI Settings'}</small></span></label>
            </div>
            {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
          </section>

          <section className="panel">
            <h2>2 · Design</h2>
            <div className="designs">
              {Object.entries(DESIGNS).map(([id, d]) => (
                <button key={id} className={`design ${design === id ? 'on' : ''}`} onClick={() => setDesign(id)} aria-pressed={design === id}>
                  <canvas ref={(el) => { thumbs.current[id] = el }} aria-hidden="true" />
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
            <div className="pills">{Object.entries(SIZES).map(([id, s]) => <button key={id} className={size === id ? 'on' : ''} onClick={() => setSize(id)}>{s.label}</button>)}</div>
            <div className="ref-row">
              <label className="file-btn"><ImagePlus size={16} /> Reference poster<input type="file" accept="image/*" hidden onChange={(e) => { onReference(e.target.files[0]); e.target.value = '' }} /></label>
              <label className="file-btn"><ImagePlus size={16} /> Logo<input type="file" accept="image/*" hidden onChange={(e) => { onLogo(e.target.files[0]); e.target.value = '' }} /></label>
              <label className="file-btn color"><Palette size={16} /> Accent<input type="color" value={accent || palette.accent || DESIGNS[design].palette.accent} onChange={(e) => setAccent(e.target.value.toUpperCase())} aria-label="Accent colour" /></label>
              {accent && <button className="link" onClick={() => setAccent('')}>Reset accent</button>}
              {logo && <button className="link" onClick={() => setLogo(null)}>Remove logo</button>}
            </div>
            {refPalette && (
              <div className="ref-palette">
                <img src={refPreview} alt="Reference poster" />
                <div>
                  <div className="swatches">{['bg', 'bg2', 'accent', 'ink'].map((k) => <span key={k} style={{ background: refPalette[k] }} title={`${k} ${refPalette[k]}`} />)}</div>
                  <label className="confirm"><input type="checkbox" checked={useRefColors} onChange={(e) => setUseRef(e.target.checked)} /> Use these colours</label>
                </div>
                <button className="icon-btn" onClick={() => { setRefPalette(null); setUseRef(false) }} aria-label="Remove reference"><X size={16} /></button>
              </div>
            )}
          </section>

          <section className="panel">
            <h2><Type size={18} /> 3 · Words</h2>
            <div className="fields">
              <label className="fld"><span>Top line</span><input value={f.eyebrow} onChange={set('eyebrow')} /></label>
              {FIELDS.map(([k, label]) => <label key={k} className="fld"><span>{label}</span><input value={f[k]} onChange={set(k)} /></label>)}
              <label className="fld wide"><span>Tagline</span><input value={f.tagline} onChange={set('tagline')} /></label>
              <label className="fld wide"><span>Skills (comma separated)</span><input value={f.skills} onChange={set('skills')} /></label>
              <label className="fld wide"><span>Highlights (one per line)</span><textarea rows={3} value={f.highlights} onChange={set('highlights')} /></label>
              <label className="fld"><span>Button text</span><input value={f.cta} onChange={set('cta')} /></label>
            </div>
          </section>
        </div>

        <div className="studio-preview">
          <div className={`canvas-frame s-${size}`}><canvas ref={canvas} aria-label="Poster preview" role="img" /></div>
          <button className="cta" onClick={download}><Download size={18} /> Download PNG ({SIZES[size].w}×{SIZES[size].h})</button>
          <button className="ghost" onClick={toLinkedIn}><Send size={16} /> Use in LinkedIn groups</button>
          <div className="caption-box">
            <div className="cap-head"><h3>LinkedIn caption</h3><button className="ghost" disabled={!caption} onClick={copyCaption}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button></div>
            <textarea rows={9} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Build the poster to get a ready caption." aria-label="LinkedIn caption" />
          </div>
        </div>
      </div>
    </div>
  )
}
