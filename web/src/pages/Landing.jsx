import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ScanSearch, Puzzle, Mic, MessageSquareText, FileSpreadsheet, Send, Image, Users, Lock, Check, Sparkles, Cpu, ArrowUp } from 'lucide-react'
import { link } from '../router.js'
import HelpBot from '../components/HelpBot.jsx'
import ThemeSwitch from '../components/ThemeSwitch.jsx'

// Adds .in to [data-reveal] elements as they scroll into view (once).
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.18, rootMargin: '0px 0px -40px 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

function Counter({ to, suffix = '', prefix = '' }) {
  const ref = useRef()
  const [n, setN] = useState(0)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setN(to)
      const t0 = performance.now()
      const tick = (t) => { const p = Math.min(1, (t - t0) / 1400); setN(Math.round(to * (1 - (1 - p) ** 3))); if (p < 1) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref}>{prefix}{n.toLocaleString('en-IN')}{suffix}</span>
}

// Words of a headline rise in one after another.
const Words = ({ text, delay = 0, className = '' }) => text.split(' ').map((w, i) => (
  <span key={i} className={`word ${className}`} style={{ '--d': `${delay + i * 70}ms` }}>{w}&nbsp;</span>
))

const FEATURES = [
  { icon: ScanSearch, title: 'Resume Matcher', text: 'Drop 500 resumes and a JD. Get strong, moderate and weak lists with name, phone and email.', demo: 'bars', span: 'wide' },
  { icon: Puzzle, title: 'Sourcing Extension', text: 'Ranks Naukri and LinkedIn search results so you only spend credits on the right profiles.', demo: 'badges' },
  { icon: Mic, title: 'Candidate Memory', text: 'Type, speak or screenshot an update. It asks when unsure, and never duplicates a person.', demo: 'mic' },
  { icon: MessageSquareText, title: 'Ask Memory', text: '“Who was rejected for Infosys and why?” Answers straight from your own records.', demo: 'chat', span: 'tall' },
  { icon: FileSpreadsheet, title: 'Excel Tracker', text: 'Say “tracker of selected candidates” and get a styled .xlsx, in your client’s own template.', demo: 'grid' },
  { icon: Send, title: 'Mail Drop', text: 'One template, every candidate personal. Outlook drafts or send from your account.', demo: 'mail' },
  { icon: Users, title: 'LinkedIn Groups', text: 'Picks the best groups for each JD and keeps you inside the weekly posting limit.', demo: 'ring' },
  { icon: Image, title: 'Poster Studio', text: 'JD in, share-ready hiring poster and LinkedIn caption out. Four designs, three sizes.', demo: 'posters', span: 'xwide' },
]

function Demo({ kind }) {
  if (kind === 'bars') return <div className="demo bars">{[['Rahul', 97], ['Meera', 92], ['Vikram', 74], ['Priya', 12]].map(([n, v], i) => <div key={n} className="bar-row" style={{ '--v': v, '--i': i }}><span>{n}</span><i /><b>{v}</b></div>)}</div>
  if (kind === 'badges') return <div className="demo badges">{['#1 · 96%', '#2 · 88%', 'Skip', '#3 · 81%'].map((b, i) => <span key={b} className={b === 'Skip' ? 'skip' : ''} style={{ '--i': i }}>{b}</span>)}</div>
  if (kind === 'mic') return <div className="demo mic-demo"><span className="mic-dot"><Mic size={20} /></span><i /><i /><i /></div>
  if (kind === 'chat') return (
    <div className="demo chat-demo">
      <p className="q">How many selected this month?</p>
      <p className="a"><span className="typing"><i /><i /><i /></span><span className="ans">3 candidates · Infosys 2, Wipro 1</span></p>
      <p className="q">Who is on hold and why?</p>
      <p className="a"><span className="typing"><i /><i /><i /></span><span className="ans">Priya Nair · salary too high</span></p>
    </div>
  )
  if (kind === 'grid') return <div className="demo cells">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i }} className={i % 6 === 4 ? 'g' : ''} />)}</div>
  if (kind === 'mail') return <div className="demo mails">{[0, 1, 2].map((i) => <span key={i} style={{ '--i': i }}><Send size={16} /></span>)}</div>
  if (kind === 'posters') return <div className="demo posters">{['noir', 'paper', 'grad', 'grid'].map((p, i) => <span key={p} className={`mini ${p}`} style={{ '--i': i }}><b>We’re hiring</b><em>Java Developer</em><u /></span>)}</div>
  return <div className="demo ring-demo"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" /><circle className="arc" cx="18" cy="18" r="15.9" /></svg><b>7/10</b></div>
}

export default function Landing({ user }) {
  useReveal()
  const hero = useRef()
  const steps = useRef()
  const cta = useRef()
  const [scrolled, setScrolled] = useState(false)
  const [showTop, setShowTop] = useState(false)
  const appLink = user ? link('/app') : link('/signup')

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24)
      setShowTop(window.scrollY > 700)
      // "How it works" line draws with scroll progress through the section.
      const el = steps.current
      if (el) {
        const r = el.getBoundingClientRect()
        const p = Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / (r.height * 0.9)))
        el.style.setProperty('--progress', p.toFixed(3))
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Hero: cursor spotlight + parallax layers.
  const onHeroMove = (e) => {
    const r = hero.current.getBoundingClientRect()
    hero.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
    hero.current.style.setProperty('--my', `${e.clientY - r.top}px`)
    hero.current.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
    hero.current.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
  }
  // Feature cards: spotlight follows the pointer inside the card.
  const onCardMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--cx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--cy', `${e.clientY - r.top}px`)
  }
  // Magnetic final button.
  const onMagnet = (e) => {
    const r = cta.current.getBoundingClientRect()
    cta.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`
  }

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'solid' : ''}`}>
        <a className="brand" {...link('/')}><span className="brand-mark" aria-hidden="true">T</span><span className="brand-name">TalentDesk</span></a>
        <nav aria-label="Sections">
          <a href="#features">Features</a><a href="#how">How it works</a><a href="#privacy">Privacy</a>
        </nav>
        <div className="lp-nav-cta">
          <ThemeSwitch />
          {user ? <a className="btn-gold" {...link('/app')}>Open app <ArrowRight size={16} /></a> : <>
            <a className="lp-login" {...link('/login')}>Log in</a>
            <a className="btn-gold" {...link('/signup')}>Start free <ArrowRight size={16} /></a>
          </>}
        </div>
      </header>

      <section className="lp-hero" ref={hero} onMouseMove={onHeroMove}>
        <div className="blob b1" aria-hidden="true" /><div className="blob b2" aria-hidden="true" /><div className="blob b3" aria-hidden="true" />
        <div className="spot" aria-hidden="true" />
        <div className="lp-hero-text">
          <p className="pill"><Sparkles size={14} /> For IT recruiters · Free · Private</p>
          <h1><Words text="Hire faster." /><br /><Words text="Remember everyone." delay={220} className="gold" /></h1>
          <p className="lp-lede">TalentDesk ranks resumes against your JD, remembers every candidate you speak to, and turns one JD into posters, mails and LinkedIn posts. All on your own computer.</p>
          <div className="lp-ctas">
            <a className="btn-gold big" {...appLink}>{user ? 'Open TalentDesk' : 'Create free account'} <ArrowRight size={18} /></a>
            <a className="btn-line big" href="#how">See how it works</a>
          </div>
          <ul className="lp-ticks"><li><Check size={14} /> Works offline</li><li><Check size={14} /> No credit card</li><li><Check size={14} /> Data stays on your PC</li></ul>
        </div>

        <div className="stage" aria-hidden="true">
          <div className="window">
            <div className="win-bar"><i /><i /><i /><span>TalentDesk · Resume Matcher</span></div>
            <div className="win-body">
              {[['Rahul Sharma', 97, 'strong'], ['Meera Iyer', 92, 'strong'], ['Vikram Singh', 74, 'moderate'], ['Priya Nair', 12, 'weak']].map(([n, v, k], i) => (
                <div key={n} className={`win-row ${k}`} style={{ '--i': i, '--v': v }}>
                  <span className="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" /><circle className="arc" cx="18" cy="18" r="15.9" /></svg><b>{v}</b></span>
                  <span className="who"><b>{n}</b><small>{k === 'weak' ? 'missing java, spring boot' : 'java · spring boot · kafka'}</small></span>
                  <span className={`tag ${k}`}>{k}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="float f-chat"><p>How many selected this month?</p><p className="a"><span className="typing"><i /><i /><i /></span><span className="ans">3 candidates</span></p></div>
          <div className="float f-card"><span className="dot" /><b>Rahul Sharma</b><small>Selected · Infosys</small></div>
          <div className="float f-poster"><b>WE’RE HIRING</b><em>Senior Java Developer</em><span>Apply now</span></div>
        </div>
      </section>

      <section className="marquee" aria-label="Works with">
        {[0, 1].map((row) => (
          <div key={row} className={`track ${row ? 'rev' : ''}`}>
            {[0, 1].map((dup) => (
              <div key={dup} className="lane" aria-hidden={dup ? 'true' : undefined}>
                {(row ? ['Java', 'React', 'Python', 'Spring Boot', 'AWS', 'Kafka', 'DevOps', '.NET', 'SAP', 'Data Engineering', 'QA Automation', 'Salesforce']
                  : ['Naukri', 'LinkedIn', 'Indeed', 'Upwork', 'Foundit', 'Outlook', 'Gmail', 'Excel', 'WhatsApp', 'Groq', 'NVIDIA Nemotron', 'OpenRouter']).map((w) => <span key={w}>{w}</span>)}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="stats" data-reveal>
        <div><b><Counter to={500} /></b><span>resumes ranked in one pass</span></div>
        <div><b><Counter to={10} /></b><span>tools in one desk</span></div>
        <div><b><Counter to={0} prefix="₹" /></b><span>to run, with free AI keys</span></div>
        <div><b><Counter to={100} suffix="%" /></b><span>of your data stays on your PC</span></div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-head" data-reveal><p className="eyebrow">Everything a recruiter repeats</p><h2>Ten tools. <em>One calm desk.</em></h2></div>
        <div className="bento">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`feat ${f.span || ''}`} data-reveal style={{ '--i': i }} onMouseMove={onCardMove}>
              <div className="feat-icon"><f.icon size={20} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <Demo kind={f.demo} />
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="lp-section how" ref={steps}>
        <div className="lp-head" data-reveal><p className="eyebrow">How it works</p><h2>From JD to shortlist <em>before lunch.</em></h2></div>
        <div className="how-track">
          <svg className="how-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M10 20 C 250 -10, 350 50, 500 20 S 750 -10, 990 20" pathLength="1" /></svg>
          {[['01', 'Paste the JD', 'Drop resumes, or scan a Naukri search with the extension. Strong, moderate and weak lists appear in seconds.'],
            ['02', 'Talk to your tracker', 'Say what happened after each call. TalentDesk files it, asks when unsure, and answers any question later.'],
            ['03', 'Reach out everywhere', 'Personal mails, a hiring poster and the best LinkedIn groups, all from the same JD.']].map(([n, t, d], i) => (
            <div key={n} className="how-step" data-reveal style={{ '--i': i }}>
              <span className="how-n">{n}</span><h3>{t}</h3><p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="privacy" className="lp-section">
        <div className="privacy" data-reveal>
          <div className="lock" aria-hidden="true"><span className="shackle" /><span className="body"><Lock size={26} /></span></div>
          <div>
            <p className="eyebrow">Private by design</p>
            <h2>Your candidates never leave <em>this computer.</em></h2>
            <ul>
              <li><Check size={16} /> Resumes, notes, PAN and CTC are stored in one file on your PC</li>
              <li><Check size={16} /> The app only answers your own computer, not the office network</li>
              <li><Check size={16} /> AI is optional: your free Groq or NVIDIA key, and you choose what goes</li>
              <li><Check size={16} /> One-click backup whenever you want</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-section ai-strip" data-reveal>
        <Cpu size={20} /><p>Works fully offline. Even sharper with free AI from <b>Groq</b>, <b>NVIDIA Nemotron</b> or <b>OpenRouter</b>.</p>
      </section>

      <section className="final" data-reveal>
        <h2>Stop re-reading <span className="mark">the same resumes.</span></h2>
        <p>Set up in two minutes. Your first shortlist in five.</p>
        <div className="magnet" onMouseMove={onMagnet} onMouseLeave={() => { cta.current.style.transform = '' }}>
          <a ref={cta} className="btn-gold big" {...appLink}>{user ? 'Open TalentDesk' : 'Create your free account'} <ArrowRight size={18} /></a>
        </div>
      </section>

      <footer className="lp-foot">
        <span className="brand"><span className="brand-mark" aria-hidden="true">T</span><span className="brand-name">TalentDesk</span></span>
        <span className="muted">Built for recruiters who are tired of losing track. Runs on your computer.</span>
      </footer>
      <button className={`to-top ${showTop ? 'show' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} aria-label="Back to top" tabIndex={showTop ? 0 : -1}><ArrowUp size={20} /></button>
      <HelpBot user={user} />
    </div>
  )
}
