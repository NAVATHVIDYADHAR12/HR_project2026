// Hiring-poster renderer: plain Canvas 2D, so the PNG is exactly what you see. No libraries.

export const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square 1:1 (LinkedIn, Instagram)' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 4:5 (LinkedIn, Instagram)' },
  story: { w: 1080, h: 1920, label: 'Story 9:16 (WhatsApp, Instagram)' },
}

export const DESIGNS = {
  noir: { label: 'Noir', palette: { bg: '#141210', ink: '#F5EFE4', accent: '#D4A24C', muted: '#A39A8C', chip: '#2A251F' }, display: 'Cormorant', body: 'Manrope', align: 'left' },
  paper: { label: 'Paper', palette: { bg: '#F6F1E7', ink: '#1C1917', accent: '#B4541A', muted: '#6B645A', chip: '#E9E1D2' }, display: 'Cormorant', body: 'Manrope', align: 'left' },
  gradient: { label: 'Gradient', palette: { bg: '#3B2BD9', ink: '#FFFFFF', accent: '#FFD166', muted: '#D9D4FF', chip: 'rgba(255,255,255,0.16)', bg2: '#C1338C' }, display: 'Manrope', body: 'Manrope', align: 'center' },
  grid: { label: 'Tech grid', palette: { bg: '#0B1220', ink: '#E6EDF7', accent: '#38E1B0', muted: '#8DA2BF', chip: '#16233A' }, display: 'Manrope', body: 'Manrope', mono: true, align: 'left' },
}

const font = (weight, size, family, italic = false) => `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px "${family}", ${family === 'Cormorant' ? 'Georgia, serif' : 'system-ui, sans-serif'}`

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxW || !line) line = test
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

// Largest font size (down to min) at which the text fits in maxLines.
function fit(ctx, text, maxW, maxLines, size, min, mk) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = mk(s)
    const lines = wrap(ctx, text, maxW)
    if (lines.length <= maxLines) return { size: s, lines }
  }
  ctx.font = mk(min)
  const lines = wrap(ctx, text, maxW).slice(0, maxLines)
  lines[maxLines - 1] = lines[maxLines - 1]?.replace(/\s*\S*$/, '…')
  return { size: min, lines }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function background(ctx, d, p, W, H, u) {
  if (d === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, p.bg); g.addColorStop(1, p.bg2 || p.accent)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'
    for (const [x, y, r] of [[W * 0.92, H * 0.08, 260], [W * 0.05, H * 0.92, 320], [W * 0.8, H * 0.75, 120]]) { ctx.beginPath(); ctx.arc(x, y, r * u, 0, Math.PI * 2); ctx.fill() }
    ctx.globalAlpha = 1
    return
  }
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H)
  if (d === 'noir') {
    ctx.strokeStyle = p.accent; ctx.globalAlpha = 0.35; ctx.lineWidth = 2 * u
    ctx.strokeRect(36 * u, 36 * u, W - 72 * u, H - 72 * u)
    ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.arc(W * 0.95, H * 0.12, 380 * u, 0, Math.PI * 2); ctx.fillStyle = p.accent; ctx.fill()
    ctx.globalAlpha = 1
  }
  if (d === 'paper') {
    ctx.fillStyle = p.accent; ctx.fillRect(0, 0, 22 * u, H)
    ctx.globalAlpha = 0.07; ctx.fillStyle = p.ink
    for (let i = 0; i < 1400; i++) ctx.fillRect((i * 7919) % W, (i * 104729) % H, 2 * u, 2 * u) // paper grain, deterministic
    ctx.globalAlpha = 1
  }
  if (d === 'grid') {
    ctx.strokeStyle = p.muted; ctx.globalAlpha = 0.09; ctx.lineWidth = 1
    for (let x = 0; x < W; x += 54 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 54 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    ctx.globalAlpha = 1
    const g = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 520 * u)
    g.addColorStop(0, p.accent + '40'); g.addColorStop(1, 'transparent')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
}

/**
 * data: { brand, eyebrow, role, tagline, skills[], details:[[label, value]], highlights[], cta, contact }
 * opts: { design, size, palette (override), logo (HTMLImageElement) }
 */
export function drawPoster(canvas, data, opts) {
  // Pass 1 on a scratch canvas measures where the content ends; pass 2 centres it in the space left above the footer.
  if (opts.shift == null) {
    const free = drawPoster(document.createElement('canvas'), data, { ...opts, shift: 0, measure: true })
    return drawPoster(canvas, data, { ...opts, shift: Number.isFinite(free) ? Math.max(0, free / 2) : 0 })
  }
  const D = DESIGNS[opts.design] || DESIGNS.noir
  const S = SIZES[opts.size] || SIZES.square
  const p = { ...D.palette, ...(opts.palette || {}) }
  const W = S.w, H = S.h, u = W / 1080
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'top'
  background(ctx, opts.design, p, W, H, u)

  const center = D.align === 'center'
  const pad = (opts.design === 'paper' ? 96 : 84) * u
  const maxW = W - pad * 2
  const X = center ? W / 2 : pad
  ctx.textAlign = center ? 'center' : 'left'
  const tall = H / W // more room on portrait/story
  let y = pad + (opts.design === 'noir' ? 20 * u : 0)

  // Top row: logo + brand
  if (opts.logo) {
    const lh = 84 * u, lw = Math.min(260 * u, (opts.logo.width / opts.logo.height) * lh)
    ctx.drawImage(opts.logo, center ? W / 2 - lw / 2 : pad, y, lw, lh)
    y += lh + 24 * u
  } else if (data.brand) {
    ctx.font = font(700, 30 * u, D.body); ctx.fillStyle = p.ink; ctx.globalAlpha = 0.9
    ctx.fillText(data.brand.toUpperCase(), X, y); ctx.globalAlpha = 1
    y += 56 * u
  }
  y += (tall > 1.2 ? 40 : 24) * u + opts.shift

  // Eyebrow
  ctx.font = font(800, 30 * u, D.body); ctx.fillStyle = p.accent
  const eyebrow = (data.eyebrow || "We're hiring").toUpperCase()
  if (D.mono) ctx.font = `700 ${Math.round(30 * u)}px ui-monospace, "Cascadia Code", Consolas, monospace`
  ctx.fillText(D.mono ? `< ${eyebrow.toLowerCase()} />` : eyebrow.split('').join(String.fromCharCode(8202)), X, y)
  y += 58 * u

  // Role title: the hero
  const roleMk = (s) => font(D.display === 'Cormorant' ? 600 : 800, s, D.display)
  const r = fit(ctx, data.role || 'Your role here', maxW, 3, (D.display === 'Cormorant' ? 150 : 118) * u, 60 * u, roleMk)
  ctx.font = roleMk(r.size); ctx.fillStyle = p.ink
  const lineH = r.size * (D.display === 'Cormorant' ? 0.98 : 1.06)
  r.lines.forEach((l, i) => ctx.fillText(l, X, y + i * lineH))
  y += r.lines.length * lineH + 26 * u
  if (opts.design === 'noir' || opts.design === 'paper') { ctx.fillStyle = p.accent; ctx.fillRect(center ? W / 2 - 50 * u : X, y, 100 * u, 6 * u); y += 34 * u }

  // Tagline
  if (data.tagline) {
    const t = fit(ctx, data.tagline, maxW, 2, 38 * u, 28 * u, (s) => font(500, s, D.display === 'Cormorant' ? 'Cormorant' : D.body, D.display === 'Cormorant'))
    ctx.font = font(500, t.size, D.display === 'Cormorant' ? 'Cormorant' : D.body, D.display === 'Cormorant'); ctx.fillStyle = p.muted
    t.lines.forEach((l, i) => ctx.fillText(l, X, y + i * t.size * 1.3))
    y += t.lines.length * t.size * 1.3 + 30 * u
  }

  // Skill chips (wrap; centre each row on centred designs)
  const skills = (data.skills || []).slice(0, tall > 1.5 ? 10 : 8)
  if (skills.length) {
    ctx.font = font(700, 28 * u, D.body)
    const chipH = 56 * u, gap = 14 * u, padX = 24 * u
    const rows = [[]]; let rowW = 0
    for (const s of skills) {
      const w = ctx.measureText(s).width + padX * 2
      if (rowW + w > maxW && rows.at(-1).length) { rows.push([]); rowW = 0 }
      rows.at(-1).push({ s, w }); rowW += w + gap
    }
    for (const row of rows.slice(0, 3)) {
      const total = row.reduce((a, c) => a + c.w, 0) + gap * (row.length - 1)
      let x = center ? W / 2 - total / 2 : X
      for (const c of row) {
        roundRect(ctx, x, y, c.w, chipH, chipH / 2); ctx.fillStyle = p.chip; ctx.fill()
        if (D.mono) { ctx.strokeStyle = p.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5 * u; ctx.stroke(); ctx.globalAlpha = 1 }
        ctx.fillStyle = p.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(c.s, x + padX, y + chipH / 2 + 1)
        ctx.textBaseline = 'top'
        x += c.w + gap
      }
      y += chipH + gap
    }
    ctx.textAlign = center ? 'center' : 'left'
    y += 22 * u
  }

  // Footer CTA (drawn from the bottom up so it never collides)
  const footH = 132 * u
  const footY = H - pad - footH + (opts.design === 'noir' ? -10 * u : 0)
  const roomBottom = footY - 30 * u

  // Detail rows, then highlights, as long as there is room
  const details = (data.details || []).filter(([, v]) => v)
  const rowH = 58 * u
  const cols = center ? Math.max(1, Math.min(3, details.length)) : 2
  const colW = maxW / cols
  details.slice(0, 4).forEach(([label, value], i) => {
    const cx = center ? W / 2 + ((i % cols) - (cols - 1) / 2) * colW : X + (i % cols) * colW
    const cy = y + Math.floor(i / cols) * (rowH + 36 * u)
    if (cy + rowH > roomBottom) return
    ctx.textAlign = center ? 'center' : 'left'
    ctx.font = font(700, 22 * u, D.body); ctx.fillStyle = p.accent
    ctx.fillText(label.toUpperCase(), cx, cy)
    ctx.font = font(700, 34 * u, D.body); ctx.fillStyle = p.ink
    const v = fit(ctx, value, colW - 24 * u, 1, 34 * u, 24 * u, (s) => font(700, s, D.body))
    ctx.font = font(700, v.size, D.body); ctx.fillText(v.lines[0], cx, cy + 28 * u)
  })
  y += Math.ceil(Math.min(details.length, 4) / cols) * (rowH + 36 * u) + 4 * u

  for (const h of (data.highlights || []).slice(0, 4)) {
    ctx.font = font(500, 30 * u, D.body)
    const lines = wrap(ctx, h, maxW - 40 * u).slice(0, 2)
    if (y + lines.length * 40 * u > roomBottom) break
    ctx.fillStyle = p.accent; ctx.textAlign = 'left'
    const bx = center ? W / 2 - Math.min(maxW, ctx.measureText(lines[0]).width + 40 * u) / 2 : X
    ctx.beginPath(); ctx.arc(bx + 8 * u, y + 18 * u, 7 * u, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.ink
    lines.forEach((l, i) => ctx.fillText(l, bx + 34 * u, y + i * 40 * u))
    y += lines.length * 40 * u + 16 * u
  }

  if (opts.measure) return roomBottom - y

  // CTA bar
  ctx.textAlign = 'left'
  roundRect(ctx, pad, footY, maxW, footH, 24 * u)
  ctx.fillStyle = opts.design === 'gradient' ? 'rgba(0,0,0,0.25)' : p.accent; ctx.fill()
  const ctaInk = opts.design === 'gradient' ? '#FFFFFF' : readableOn(p.accent)
  ctx.fillStyle = ctaInk
  ctx.font = font(800, 34 * u, D.body)
  const cta = data.cta || 'Apply now'
  ctx.fillText(cta, pad + 36 * u, footY + 26 * u)
  const c = fit(ctx, data.contact || 'Share your CV', maxW - 72 * u, 1, 30 * u, 20 * u, (s) => font(600, s, D.body))
  ctx.font = font(600, c.size, D.body); ctx.globalAlpha = 0.9
  ctx.fillText(c.lines[0], pad + 36 * u, footY + 74 * u)
  ctx.globalAlpha = 1
  return canvas
}

// Black or white text, whichever reads better on a colour (WCAG relative luminance).
export function readableOn(hex) {
  const m = String(hex).replace('#', '').match(/.{2}/g)
  if (!m) return '#FFFFFF'
  const [r, g, b] = m.slice(0, 3).map((x) => { const c = parseInt(x, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#141210' : '#FFFFFF'
}

/** Dominant colours of a reference poster -> a palette for any design. */
export function paletteFromImage(img) {
  const c = document.createElement('canvas')
  const s = 96
  c.width = s; c.height = Math.max(1, Math.round((img.height / img.width) * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const key = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4) // 4 bits per channel
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]
    buckets.set(key, b)
  }
  const colors = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round))
  const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
  const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const bg = colors[0] || [20, 18, 16]
  // Accent: the most saturated common colour that stands apart from the background.
  const accent = colors.slice(0, 24).filter((c) => dist(c, bg) > 90).sort((a, b) => sat(b) - sat(a))[0] || colors.find((c) => dist(c, bg) > 60) || [212, 162, 76]
  const second = colors.slice(1, 12).find((c) => dist(c, bg) > 40 && dist(c, accent) > 60) || accent
  const ink = readableOn(hex(bg))
  const isDark = ink === '#FFFFFF'
  return {
    bg: hex(bg), bg2: hex(second), accent: hex(accent), ink,
    muted: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)',
    chip: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
  }
}
