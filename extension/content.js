// Injected on demand into the current job-board tab. Safe to inject more than once.
(() => {
  if (window.__tdSourcer) return

  // Known result-card selectors. Job boards change their markup, so the generic finder below is the real safety net.
  const SITE_SELECTORS = [
    // Naukri Resdex / search
    '.tuple', '[class*="tuple-card"]', '[class*="candidate-card"]', '[class*="srp-tuple"]', 'article.jobTuple',
    // LinkedIn search / Recruiter
    'li.reusable-search__result-container', '[data-chameleon-result-urn]', 'li[class*="profile-list__border"]', 'ol.profile-list > li',
    // Indeed resume search, Upwork talent search, Monster/Foundit
    '[data-testid="resume-card"]', '[data-test="FreelancerTile"]', 'section[data-qa="freelancer"]', '.card-apply-content',
  ]
  const CARD_HINT = /\b\d{1,2}(?:\.\d)?\s*\+?\s*(?:y|yrs?|years?)\b|\blacs?\b|\blpa\b|notice|key skills|experience|\$\d+(?:\.\d+)?\/hr/i

  const signature = (el) => el.tagName + '.' + cls(el).join('.')
  const cls = (el) => [...el.classList].filter((c) => !/active|selected|hover|focus|\d{3,}/i.test(c)).slice(0, 2)
  function selectorFor(el) {
    const own = el.tagName.toLowerCase() + cls(el).map((c) => '.' + CSS.escape(c)).join('')
    if (cls(el).length || !el.parentElement || el.parentElement === document.body) return own
    return `${selectorFor(el.parentElement)} > ${own}` // class-less card: anchor to its parent
  }
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'

  function fromSelector(sel) {
    try { return [...document.querySelectorAll(sel)].filter((el) => visible(el) && el.innerText.trim().length > 40) } catch { return [] }
  }

  // Generic finder: the biggest group of same-looking siblings whose text looks like candidate profiles.
  function findRepeated() {
    let best = [], bestScore = 0
    for (const parent of document.querySelectorAll('body *')) {
      if (parent.children.length < 3) continue
      const groups = new Map()
      for (const ch of parent.children) {
        const sig = signature(ch)
        if (!groups.has(sig)) groups.set(sig, [])
        groups.get(sig).push(ch)
      }
      for (const els of groups.values()) {
        if (els.length < 3) continue
        const ok = els.filter((el) => { const n = el.innerText?.length || 0; return n > 60 && n < 6000 && visible(el) })
        const hinted = ok.filter((el) => CARD_HINT.test(el.innerText)).length
        if (ok.length < 3 || hinted < ok.length / 2) continue
        const score = hinted * 10 + ok.length
        if (score > bestScore) { bestScore = score; best = ok }
      }
    }
    return best
  }

  function nameOf(card) {
    const cands = [...card.querySelectorAll('a, h1, h2, h3, h4, strong, [class*="name" i]')]
    for (const el of cands) {
      const t = el.innerText?.trim().replace(/\s+/g, ' ')
      if (t && t.length < 50 && /^[A-Za-z][A-Za-z .'-]+$/.test(t) && t.split(' ').length <= 5 && !/view|profile|download|save|contact|resume|message|more/i.test(t)) return t
    }
    return card.innerText.trim().split('\n')[0].slice(0, 50)
  }

  let cards = []
  function collect(savedSelector) {
    let source = 'auto'
    if (savedSelector) { cards = fromSelector(savedSelector); source = 'saved' }
    if (!cards.length) for (const sel of SITE_SELECTORS) { cards = fromSelector(sel); if (cards.length >= 2) { source = 'site'; break } }
    if (cards.length < 2) { cards = findRepeated(); source = 'auto' }
    return { source, cards: cards.map((c) => ({ name: nameOf(c), text: c.innerText.slice(0, 6000) })) }
  }

  const COLORS = { strong: '#15803d', moderate: '#b45309', weak: '#78716c', fail: '#b91c1c' }
  function clear() {
    document.querySelectorAll('.td-badge').forEach((b) => b.remove())
    for (const c of cards) { c.style.outline = ''; c.style.opacity = ''; c.style.outlineOffset = '' }
  }
  function highlight(results, strong = 75, moderate = 50) {
    clear()
    for (const r of results) {
      const card = cards[r.index]
      if (!card) continue
      const tier = !r.pass ? 'fail' : r.score >= strong ? 'strong' : r.score >= moderate ? 'moderate' : 'weak'
      card.style.outline = `3px solid ${COLORS[tier]}`
      card.style.outlineOffset = '2px'
      if (!r.pass || tier === 'weak') card.style.opacity = '0.45'
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
      const b = document.createElement('div')
      b.className = 'td-badge'
      // Short label sitting on the outline so it never covers the candidate's details; full reasons are in the popup.
      b.textContent = r.pass ? `${r.rank ? `#${r.rank} · ` : ''}${r.score}%` : 'Skip'
      Object.assign(b.style, { position: 'absolute', top: '-12px', right: '12px', zIndex: 2147483646, padding: '2px 10px', borderRadius: '999px', background: COLORS[tier], color: '#fff', font: '700 12px/1.4 system-ui, sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,.2)' })
      card.appendChild(b)
    }
  }
  function scrollTo(i) {
    const c = cards[i]
    if (!c) return
    c.scrollIntoView({ behavior: 'smooth', block: 'center' })
    c.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 600 })
  }

  // "Pick a card" mode: hover shows an outline, click saves the layout for this site.
  function pick() {
    let last
    const over = (e) => { if (last) last.style.boxShadow = ''; last = e.target; last.style.boxShadow = '0 0 0 3px #a16207 inset' }
    const click = (e) => {
      e.preventDefault(); e.stopPropagation()
      if (last) last.style.boxShadow = ''
      // The card is the outermost ancestor that repeats among its siblings and is still card-sized
      // (lines inside a card repeat too, so the first repeating element is usually too small).
      let el = e.target
      for (let a = e.target; a && a.parentElement && a !== document.body; a = a.parentElement) {
        const sig = signature(a)
        const len = a.innerText?.length || 0
        if (len < 6000 && [...a.parentElement.children].filter((s) => signature(s) === sig).length >= 2) el = a
      }
      const selector = selectorFor(el)
      const count = fromSelector(selector).length
      chrome.storage.local.set({ ['sel:' + location.hostname]: selector })
      document.removeEventListener('mouseover', over, true)
      document.removeEventListener('click', click, true)
      toast(`Saved card layout for ${location.hostname}: ${count} cards found. Open TalentDesk and click Scan.`)
    }
    document.addEventListener('mouseover', over, true)
    document.addEventListener('click', click, true)
    toast('Click on any one candidate card.')
  }
  function toast(msg) {
    const t = document.createElement('div')
    t.textContent = msg
    Object.assign(t.style, { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2147483647, padding: '12px 18px', borderRadius: '12px', background: '#17140f', color: '#f7f5f1', font: '500 14px/1.4 system-ui, sans-serif', boxShadow: '0 12px 30px rgba(0,0,0,.3)' })
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 4000)
  }

  // LinkedIn group search results / "My groups": every link to /groups/<id>, with the member count shown near it.
  function collectGroups() {
    const seen = new Map()
    for (const a of document.querySelectorAll('a[href*="/groups/"]')) {
      const id = a.href.match(/\/groups\/(\d+)/)?.[1]
      const name = a.innerText.trim().split('\n')[0].trim()
      if (!id || !name || name.length > 150 || /^(groups?|see all|show all|view|join|leave|\d+)$/i.test(name)) continue
      // Walk up a few levels to the result card to read "12K members".
      let card = a, members = ''
      for (let i = 0; i < 6 && card && !members; i++, card = card.parentElement) members = card.innerText?.match(/([\d.,]+\s*[KM]?)\s+members?/i)?.[1] || ''
      const prev = seen.get(id)
      if (!prev || (name.length > prev.name.length && name.length < 120) || (!prev.members && members)) seen.set(id, { name: prev && prev.name.length >= name.length ? prev.name : name, url: `https://www.linkedin.com/groups/${id}/`, members: members || prev?.members || '' })
    }
    return [...seen.values()]
  }

  window.__tdSourcer = { collect, highlight, scrollTo, pick, clear, collectGroups }
})()
