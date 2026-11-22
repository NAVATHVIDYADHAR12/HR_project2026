import { Component, useEffect, useState } from 'react'
import { ScanSearch, Puzzle, Image, Users as Linkedin, Brain, MessageSquareText, Send, Settings, AlertTriangle, RotateCcw, LogOut } from 'lucide-react'
import Matcher from './pages/Matcher.jsx'
import SettingsPage from './pages/Settings.jsx'
import Extension from './pages/Extension.jsx'
import Memory from './pages/Memory.jsx'
import Ask from './pages/Ask.jsx'
import MailPage from './pages/Mail.jsx'
import Poster from './pages/Poster.jsx'
import LinkedIn from './pages/LinkedIn.jsx'
import { link } from './router.js'
import HelpBot from './components/HelpBot.jsx'
import ThemeSwitch from './components/ThemeSwitch.jsx'

// Sidebar in workflow order: find people → keep track → reach out.
const NAV = [
  { group: 'Source' },
  { id: 'match', label: 'Resume Matcher', icon: ScanSearch, Page: Matcher },
  { id: 'extension', label: 'Sourcing Extension', icon: Puzzle, Page: Extension },
  { group: 'Track' },
  { id: 'memory', label: 'Candidate Memory', icon: Brain, Page: Memory },
  { id: 'ask', label: 'Ask Memory', icon: MessageSquareText, Page: Ask },
  { group: 'Outreach' },
  { id: 'mail', label: 'Mail Drop', icon: Send, Page: MailPage },
  { id: 'poster', label: 'Poster Studio', icon: Image, Page: Poster },
  { id: 'linkedin', label: 'LinkedIn Groups', icon: Linkedin, Page: LinkedIn },
  { group: '' },
  { id: 'settings', label: 'Settings', icon: Settings, Page: SettingsPage },
]
const PAGES = NAV.filter((n) => n.id)

const load = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const store = (k, v) => { try { localStorage.setItem(k, v) } catch {} }

// One broken page must not blank the whole app.
class PageGuard extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Page crashed:', error, info) }
  componentDidUpdate(prev) { if (prev.page !== this.props.page && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <div className="crash" role="alert">
          <AlertTriangle size={28} />
          <h2>This page hit a problem</h2>
          <p className="muted">Your data is safe. Try again, or switch to another page.</p>
          <code>{String(this.state.error?.message || this.state.error).slice(0, 300)}</code>
          <button className="cta small" onClick={() => this.setState({ error: null })}><RotateCcw size={16} /> Try again</button>
        </div>
      </div>
    )
  }
}

export default function App({ user, onLogout }) {
  // #linkedin = back from LinkedIn's sign-in page; otherwise the last page used.
  const [page, setPage] = useState(() => location.hash === '#linkedin' ? 'linkedin' : PAGES.some((p) => p.id === load('td-page')) ? load('td-page') : 'match')
  useEffect(() => { if (location.hash) history.replaceState({}, '', location.pathname + location.search) }, [])
  // Pages can switch page by dispatching `td-nav` (e.g. Poster Studio → LinkedIn Groups).
  useEffect(() => {
    const go = (e) => { if (PAGES.some((p) => p.id === e.detail)) { setPage(e.detail); window.scrollTo(0, 0) } }
    window.addEventListener('td-nav', go)
    return () => window.removeEventListener('td-nav', go)
  }, [])
  useEffect(() => { store('td-page', page) }, [page])
  const { Page } = PAGES.find((p) => p.id === page)

  return (
    <div className={`shell ${page === 'ask' ? 'has-askbar' : ''}`}>
      <aside className="side">
        <a className="brand" {...link('/')} aria-label="TalentDesk home">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span className="brand-name">TalentDesk</span>
        </a>
        <nav aria-label="Main">
          {NAV.map((n, i) => n.group !== undefined
            ? n.group ? <span key={'g' + i} className="nav-group">{n.group}</span> : <span key={'g' + i} className="nav-sep" />
            : (
              <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => { setPage(n.id); window.scrollTo(0, 0) }}
                aria-current={page === n.id ? 'page' : undefined}>
                <n.icon size={18} aria-hidden="true" />
                <span>{n.label}</span>
              </button>
            ))}
        </nav>
        <div className="side-foot">
          {user && (
            <div className="me">
              <span className="avatar" aria-hidden="true">{user.name.trim()[0]?.toUpperCase()}</span>
              <span className="me-text"><b>{user.name}</b><small>{user.email}</small></span>
              <button className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={16} /></button>
            </div>
          )}
          <ThemeSwitch label />
        </div>
      </aside>
      <main className="main">
        <PageGuard page={page}><Page key={page} /></PageGuard>
      </main>
      <HelpBot inApp user={user} />
    </div>
  )
}
