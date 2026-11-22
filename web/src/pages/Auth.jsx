import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2, AlertTriangle, Lock, Check, ArrowLeft } from 'lucide-react'
import { link } from '../router.js'

const WINS = [
  ['Strong match · 97%', 'Rahul Sharma', 'java · spring boot · kafka'],
  ['Selected · Infosys', 'Meera Iyer', 'notice 30 days · 16 LPA'],
  ['Mail sent', '24 candidates', 'Senior Java Developer opening'],
  ['Tracker ready', 'selected-nov.xlsx', '12 rows · client template'],
]

// 0-4: length, upper+lower, digit, symbol.
const strength = (p) => (p.length >= 8) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^A-Za-z0-9]/.test(p)
const LEVEL = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

export default function Auth({ mode, hasUsers, demo, onAuthed }) {
  const signup = mode === 'signup'
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [win, setWin] = useState(0)
  useEffect(() => { const t = setInterval(() => setWin((w) => (w + 1) % WINS.length), 2600); return () => clearInterval(t) }, [])
  useEffect(() => { setError('') }, [mode])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signup ? f : { email: f.email, password: f.password }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Something went wrong. Try again.')
      onAuthed(j.user)
    } catch (e2) { setError(e2.message.includes('fetch') ? 'Can’t reach TalentDesk. Is it running?' : e2.message) } finally { setBusy(false) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const s = strength(f.password)

  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden="true">
        <div className="blob b1" /><div className="blob b2" />
        <a className="brand" {...link('/')}><span className="brand-mark">T</span><span className="brand-name">TalentDesk</span></a>
        <div className="art-copy">
          <h2>{signup ? <>Your whole hiring desk, <em>in one calm place.</em></> : <>Welcome back. <em>Your candidates missed you.</em></>}</h2>
          <div className="win-stack">
            {WINS.map(([tag, title, sub], i) => (
              <div key={tag} className={`win-card ${i === win ? 'on' : i === (win + WINS.length - 1) % WINS.length ? 'out' : ''}`}>
                <span className="win-tag"><Check size={12} /> {tag}</span><b>{title}</b><small>{sub}</small>
              </div>
            ))}
          </div>
        </div>
        <p className="art-foot"><Lock size={14} /> {demo ? 'Public demo: sample data only. Run it on your own PC for real candidates.' : 'Your account and data stay on this computer.'}</p>
      </aside>

      <main className="auth-main">
        <a className="back" {...link('/')}><ArrowLeft size={16} /> Home</a>
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>{signup ? 'Create your account' : 'Log in'}</h1>
          <p className="muted">{signup ? (hasUsers ? 'Add another login for this computer.' : 'Two minutes, then your first shortlist.') : 'Pick up where you left off.'}</p>
          {demo && !signup && (
            <p className="status ok">Live demo with sample data. <button type="button" className="ghost" onClick={() => setF({ ...f, email: demo.email, password: demo.password })}>Use the demo login</button></p>
          )}

          {signup && (
            <label className="a-field"><span>Your name</span>
              <input value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} placeholder="Priya Nair" autoFocus />
            </label>
          )}
          <label className="a-field"><span>Work email</span>
            <input type="email" value={f.email} onChange={set('email')} autoComplete="email" required placeholder="you@agency.com" autoFocus={!signup} />
          </label>
          <label className="a-field"><span>Password</span>
            <span className="pw">
              <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={8} placeholder={signup ? 'At least 8 characters' : 'Your password'} />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          {signup && f.password && (
            <div className={`meter s${s}`} aria-live="polite"><span><i /><i /><i /><i /></span><small>{LEVEL[f.password.length < 8 ? 0 : s]}</small></div>
          )}

          {error && <p className="status bad" role="alert"><AlertTriangle size={16} /> {error}</p>}
          <button className="btn-gold big full" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : null}{signup ? 'Create account' : 'Log in'} {!busy && <ArrowRight size={18} />}
          </button>
          <p className="switch-auth">
            {signup ? <>Already have an account? <a {...link('/login')}>Log in</a></> : <>New here? <a {...link('/signup')}>Create a free account</a></>}
          </p>
          {!signup && <p className="muted small-note">Forgot your password? In the TalentDesk folder run <code>npm run reset-password your@email</code> to get a temporary one.</p>}
        </form>
      </main>
    </div>
  )
}
