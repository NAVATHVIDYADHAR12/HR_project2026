// Client-side navigation without a router library: push the path and tell the root to re-read it.
export function go(path) {
  if (location.pathname !== path) history.pushState({}, '', path)
  window.dispatchEvent(new Event('td-route'))
  window.scrollTo(0, 0)
}

// Plain <a href> that navigates in-app (keeps middle-click / open-in-new-tab working).
export const link = (path) => ({ href: path, onClick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go(path) } })

export function initTheme() {
  try { document.documentElement.dataset.theme = localStorage.getItem('td-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') } catch {}
}
