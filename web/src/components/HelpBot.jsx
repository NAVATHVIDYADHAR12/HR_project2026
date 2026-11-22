import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, ArrowUp, Sparkles, ArrowRight } from 'lucide-react'
import { go } from '../router.js'

const START = ['How do I match resumes?', 'How do I install the extension?', 'How many selected this month?', 'remember: Infosys pays max 18 LPA for Java']

/** Floating help assistant. inApp=true → page links switch app pages; otherwise they go to sign up / log in. */
export default function HelpBot({ inApp = false, user }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([{ from: 'bot', text: `Hi${user ? ' ' + user.name.split(' ')[0] : ''}! I’m the TalentDesk helper. Ask me how anything works${inApp ? ', ask about your candidates, or teach me something with “remember: …”' : ''}.`, suggestions: inApp ? START : START.slice(0, 2) }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(), input = useRef()
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy, open])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  useEffect(() => { const k = (e) => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])

  async function send(q = text) {
    q = q.trim()
    if (!q || busy) return
    setText(''); setBusy(true)
    setMsgs((m) => [...m, { from: 'me', text: q }])
    try {
      const r = await fetch('/api/help', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) }).then((x) => x.json())
      setMsgs((m) => [...m, { from: 'bot', text: r.reply || r.error || 'Sorry, something went wrong.', links: r.links, suggestions: r.suggestions, ai: r.ai }])
    } catch { setMsgs((m) => [...m, { from: 'bot', text: 'I can’t reach TalentDesk right now. Is it running?' }]) }
    finally { setBusy(false) }
  }
  const follow = (l) => {
    if (l.page && inApp) { window.dispatchEvent(new CustomEvent('td-nav', { detail: l.page })); if (window.innerWidth < 700) setOpen(false) }
    else go(l.to || '/signup')
  }

  return (
    <>
      <button className={`bot-fab ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label={open ? 'Close help' : 'Open help chat'} aria-expanded={open}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <span className="bot-ping" aria-hidden="true" />}
      </button>
      {open && (
        <section className="bot" role="dialog" aria-label="TalentDesk help">
          <header>
            <span className="bot-avatar"><Sparkles size={16} /></span>
            <div><b>TalentDesk helper</b><small>{inApp ? 'Knows every feature and your candidates' : 'Ask anything about TalentDesk'}</small></div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close help"><X size={18} /></button>
          </header>
          <div className="bot-msgs" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`bm from-${m.from}`}>
                <p>{m.text}</p>
                {m.links?.length > 0 && <div className="bm-links">{m.links.map((l) => <button key={l.label} onClick={() => follow(l)}>{l.label} <ArrowRight size={13} /></button>)}</div>}
                {m.suggestions?.length > 0 && i === msgs.length - 1 && <div className="bm-sugg">{m.suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
              </div>
            ))}
            {busy && <div className="bm from-bot"><p className="typing" aria-label="Typing"><i /><i /><i /></p></div>}
            <div ref={end} />
          </div>
          <form className="bot-input" onSubmit={(e) => { e.preventDefault(); send() }}>
            <label className="sr" htmlFor="bot-q">Message</label>
            <input id="bot-q" ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything…" autoComplete="off" maxLength={1000} />
            <button disabled={!text.trim() || busy} aria-label="Send"><ArrowUp size={18} /></button>
          </form>
        </section>
      )}
    </>
  )
}
