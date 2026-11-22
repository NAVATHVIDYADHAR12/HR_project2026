import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'

/** Day / night switch. The theme lives on <html data-theme> (set at startup by initTheme) and in localStorage. */
export default function ThemeSwitch({ label = false }) {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark')
  const flip = () => {
    const t = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('td-theme', t) } catch {}
    setDark(!dark)
  }
  return (
    <button className={`theme-switch ${dark ? 'dark' : ''}`} role="switch" aria-checked={dark} aria-label="Dark mode" onClick={flip}>
      <span className="ts-track"><Sun size={13} className="ts-sun" /><Moon size={13} className="ts-moon" /><span className="ts-knob" /></span>
      {label && <span className="ts-label">{dark ? 'Night' : 'Day'} mode</span>}
    </button>
  )
}
