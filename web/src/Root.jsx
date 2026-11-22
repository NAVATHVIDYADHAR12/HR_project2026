'use client'
import { useEffect, useState } from 'react'
import App from './App.jsx'
import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'
import { go, initTheme } from './router.js'

// Loaded by Next.js in the browser only (app/[[...slug]]/page.jsx, ssr: false).
initTheme()
// Tiny router: / landing, /signup, /login, /app (needs a login).
const ROUTES = ['/', '/signup', '/login', '/app']
const norm = (p) => (ROUTES.includes(p) ? p : p.startsWith('/app') ? '/app' : '/')

// Any API call that comes back "please log in" (expired session) sends the user to the login page.
const rawFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const res = await rawFetch(input, init)
  const url = typeof input === 'string' ? input : input.url
  if (res.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/') && location.pathname === '/app') go('/login')
  return res
}

export default function Root() {
  const [path, setPath] = useState(norm(location.pathname))
  const [user, setUser] = useState(undefined) // undefined = checking, null = logged out
  const [hasUsers, setHasUsers] = useState(true)
  const [demo, setDemo] = useState(null)

  useEffect(() => {
    const on = () => setPath(norm(location.pathname))
    window.addEventListener('popstate', on); window.addEventListener('td-route', on)
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('td-route', on) }
  }, [])
  useEffect(() => {
    rawFetch('/api/auth/me').then(async (r) => { const j = await r.json(); setUser(j.user || null); if (!j.user) { setHasUsers(j.hasUsers !== false); setDemo(j.demo || null) } })
      .catch(() => setUser(null))
  }, [path])
  useEffect(() => {
    if (path === '/app' && user === null) go(hasUsers ? '/login' : '/signup')
    if ((path === '/login' || path === '/signup') && user) go('/app')
  }, [path, user, hasUsers])

  const logout = async () => { await rawFetch('/api/auth/logout', { method: 'POST' }); setUser(null); go('/') }
  if (path === '/') return <Landing user={user} />
  if (path === '/signup' || path === '/login') return <Auth mode={path.slice(1)} hasUsers={hasUsers} demo={demo} onAuthed={(u) => { setUser(u); go('/app') }} />
  if (!user) return <div className="boot" aria-label="Loading"><span className="brand-mark">T</span></div>
  return <App user={user} onLogout={logout} />
}
