import { db } from './db.js'
import { STATUSES, FIELD_LABELS, toLakhs, noticeDays, toISODate } from './memory.js'

export const FIELDS = ['name', 'email', 'phone', 'status', 'reason', 'company', 'role', 'notice', 'ctc', 'ectc', 'currentCompany', 'previousCompany',
  'leavingReason', 'leavingDate', 'location', 'jobLocation', 'qualification', 'dob', 'pan', 'skills']
const FINAL = new Set(['selected', 'rejected', 'eliminated'])
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function knownNames() {
  return db.prepare("SELECT name FROM candidates UNION SELECT name FROM resumes WHERE name <> ''").all().map((r) => r.name)
}
export function knownCompanies() {
  return db.prepare('SELECT company c FROM candidates UNION SELECT currentCompany FROM candidates UNION SELECT previousCompany FROM candidates').all().map((r) => r.c).filter(Boolean)
}

const describe = (c) => [cap(c.status), c.company, c.email || c.phone].filter(Boolean).join(' · ')

function findMatches(f) {
  if (f.email) { const r = db.prepare('SELECT * FROM candidates WHERE email = ?').all(f.email); if (r.length) return { exact: r } }
  if (f.phone) { const r = db.prepare('SELECT * FROM candidates WHERE phone = ?').all(f.phone); if (r.length) return { exact: r } }
  if (!f.name) return { exact: [] }
  const byName = db.prepare('SELECT * FROM candidates WHERE lower(name) = lower(?)').all(f.name)
  if (byName.length) return { exact: byName, byNameOnly: true }
  // "Rahul" -> "Rahul Sharma": possible, must be confirmed.
  const partial = db.prepare("SELECT * FROM candidates WHERE lower(name) LIKE lower(?) || ' %' OR lower(name) LIKE '% ' || lower(?)").all(f.name, f.name)
  return { exact: [], partial }
}

const validPan = (p) => /^[A-Z]{5}\d{4}[A-Z]$/.test(p)
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)
const validPhone = (p) => p.replace(/\D/g, '').length >= 10

/**
 * For each parsed block: who it matches, what would change, and what to ask the user.
 * Question kinds: required (must fill), choose (pick one), match (which existing person), confirm (tick), warn (check, not blocking).
 */
export function review(parsed) {
  return parsed.map(({ fields: f, ambiguous = {}, block, unclear = [] }) => {
    const questions = unclear.map((message) => ({ field: 'note', kind: 'warn', message }))
    const fromResume = []
    const { exact, partial = [], byNameOnly } = findMatches(f)
    let matchId = null

    if (exact.length === 1) matchId = exact[0].id
    else if (exact.length > 1) questions.push({ field: 'match', kind: 'match', message: `There are ${exact.length} people called ${f.name} in memory. Which one is this?`, options: exact.map((c) => ({ id: c.id, label: `${c.name} · ${describe(c)}` })) })
    else if (partial.length) questions.push({ field: 'match', kind: 'match', message: `Is "${f.name}" one of these people already in memory?`, options: partial.map((c) => ({ id: c.id, label: `${c.name} · ${describe(c)}` })) })
    const existing = matchId ? db.prepare('SELECT * FROM candidates WHERE id = ?').get(matchId) : null
    if (existing && byNameOnly && (f.email || f.phone) && (existing.email || existing.phone))
      questions.push({ field: 'match', kind: 'match', message: `${existing.name} is in memory with different contact details (${existing.email || existing.phone}). Same person?`, options: [{ id: existing.id, label: `Yes, update ${existing.name}` }] })

    // Fill contact details from an uploaded resume with the same name or email.
    if (!f.email || !f.phone) {
      const res = f.email ? db.prepare('SELECT * FROM resumes WHERE email = ?').all(f.email) : f.name ? db.prepare('SELECT * FROM resumes WHERE lower(name) = lower(?)').all(f.name) : []
      if (res.length === 1) {
        for (const k of ['email', 'phone']) if (!f[k] && res[0][k] && !existing?.[k]) { f[k] = res[0][k]; fromResume.push(k) }
        if (!f.skills && res[0].skills && !existing?.skills) { f.skills = res[0].skills; fromResume.push('skills') }
        f.resumeId = res[0].id
      }
    }

    if (!f.name && !existing) questions.push({ field: 'name', kind: 'required', message: 'Who is this about? I could not find a name.' })
    if (ambiguous.status?.length) questions.push({ field: 'status', kind: 'choose', message: `The note mentions ${ambiguous.status.join(' and ')}. Which is the current status?`, options: ambiguous.status })
    else if (ambiguous.statusText) questions.push({ field: 'status', kind: 'choose', message: `I don't know the status "${ambiguous.statusText}". Which one is it?`, options: STATUSES })
    else if (!f.status && !existing && !questions.some((q) => q.field === 'match')) questions.push({ field: 'status', kind: 'choose', message: `What is the status for ${f.name || 'this candidate'}?`, options: STATUSES })

    if (existing && f.status && f.status !== existing.status && FINAL.has(existing.status) && (!f.company || !existing.company || f.company.toLowerCase() === existing.company.toLowerCase()))
      questions.push({ field: 'status', kind: 'confirm', message: `${existing.name} is currently ${cap(existing.status)}${existing.company ? ` for ${existing.company}` : ''}. Change to ${cap(f.status)}?` })
    if (existing?.pan && f.pan && existing.pan !== f.pan) questions.push({ field: 'pan', kind: 'confirm', message: `PAN differs from the one saved (${maskPan(existing.pan)}). Replace it?` })
    if (f.pan && !validPan(f.pan)) questions.push({ field: 'pan', kind: 'warn', message: `"${f.pan}" doesn't look like a PAN (5 letters, 4 digits, 1 letter).` })
    if (f.email && !validEmail(f.email)) questions.push({ field: 'email', kind: 'warn', message: `"${f.email}" doesn't look like an email.` })
    if (f.phone && !validPhone(f.phone)) questions.push({ field: 'phone', kind: 'warn', message: `"${f.phone}" is too short for a phone number.` })
    if (f.dob && !/^\d{4}-\d{2}-\d{2}$/.test(f.dob)) questions.push({ field: 'dob', kind: 'warn', message: `I couldn't read the date of birth "${f.dob}". Use DD/MM/YYYY.` })

    const changes = existing ? FIELDS.filter((k) => f[k] != null && f[k] !== '' && String(f[k]) !== String(existing[k] ?? '')).map((k) => ({ field: k, from: existing[k] ?? '', to: f[k] })) : []
    return { block, fields: f, matchId, existing: existing && { id: existing.id, name: existing.name, status: existing.status, company: existing.company }, changes, questions, fromResume }
  })
}

export const maskPan = (p) => (p && p.length === 10 ? `${p.slice(0, 5)}****${p.slice(9)}` : p || '')

function indexFts(id) {
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id)
  const ev = db.prepare('SELECT status, company, role, reason, note FROM events WHERE candidateId = ?').all(id)
  const body = [...FIELDS.filter((k) => k !== 'pan').map((k) => c[k]), ...ev.flatMap((e) => [e.status, e.company, e.role, e.reason, e.note])].filter(Boolean).join(' \n ')
  db.prepare('DELETE FROM candidates_fts WHERE rowid = ?').run(id)
  db.prepare('INSERT INTO candidates_fts (rowid, name, body) VALUES (?, ?, ?)').run(id, c.name, body)
}

/** Save reviewed items. item: { fields, matchId (number | null = new) } */
export function save(items, note = '', source = 'text') {
  const errors = []
  items.forEach((it, i) => {
    const existing = it.matchId ? db.prepare('SELECT id, status FROM candidates WHERE id = ?').get(it.matchId) : null
    if (it.matchId && !existing) errors.push(`#${i + 1}: that candidate no longer exists`)
    if (!existing && !it.fields.name?.trim()) errors.push(`#${i + 1}: name is required`)
    if (!existing && !it.fields.status) errors.push(`#${i + 1} (${it.fields.name}): status is required`)
    if (it.fields.status && !STATUSES.includes(it.fields.status)) errors.push(`#${i + 1}: unknown status "${it.fields.status}"`)
  })
  if (errors.length) throw Object.assign(new Error(errors.join('; ')), { status: 400 })

  const ids = []
  db.exec('BEGIN')
  try {
    const noteId = note.trim() ? Number(db.prepare('INSERT INTO notes (text, source) VALUES (?, ?)').run(note.slice(0, 20000), source).lastInsertRowid) : null
    for (const { fields: raw, matchId } of items) {
      const f = {}
      for (const k of FIELDS) if (raw[k] != null && String(raw[k]).trim() !== '') f[k] = String(raw[k]).trim()
      if (f.pan) f.pan = f.pan.toUpperCase()
      if (f.email) f.email = f.email.toLowerCase()
      if (f.status) f.status = f.status.toLowerCase()
      if (f.name) f.name = f.name.replace(/\s+/g, ' ')
      if (f.dob) f.dob = toISODate(f.dob) || f.dob
      if ('notice' in f) f.noticeDays = noticeDays(f.notice)
      if ('ctc' in f) f.ctcLakhs = toLakhs(f.ctc)
      if ('ectc' in f) f.ectcLakhs = toLakhs(f.ectc)
      const date = toISODate(raw.date || 'today') || new Date().toISOString().slice(0, 10)
      if (f.status) f.statusDate = date
      if (raw.resumeId) f.resumeId = raw.resumeId

      let id = matchId
      if (id) {
        // "Rahul" matched to "Rahul Sharma": keep the fuller saved name.
        const old = db.prepare('SELECT name FROM candidates WHERE id = ?').get(id).name
        if (f.name && old.toLowerCase().includes(f.name.toLowerCase())) delete f.name
        // A reason belongs to a status: a new status without a reason clears the old one (it stays in history).
        if (f.status && !f.reason) f.reason = null
        const keys = Object.keys(f)
        if (keys.length) db.prepare(`UPDATE candidates SET ${keys.map((k) => `${k} = ?`).join(', ')}, updatedAt = datetime('now') WHERE id = ?`).run(...keys.map((k) => f[k]), id)
      } else {
        const keys = Object.keys(f)
        id = Number(db.prepare(`INSERT INTO candidates (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => f[k])).lastInsertRowid)
      }
      // Every note leaves a history entry, so "why/when was X rejected" can be answered later.
      db.prepare('INSERT INTO events (candidateId, date, status, company, role, reason, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, date, f.status || null, f.company || null, f.role || null, f.reason || null, noteId ? `note:${noteId}` : null)
      indexFts(id)
      ids.push(id)
    }
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  return ids
}

export function list({ status, q, limit = 200 } = {}) {
  const where = [], args = []
  if (status) { where.push('c.status = ?'); args.push(status) }
  if (q?.trim()) {
    // Prefix search on every word: "jav kaf" finds Java + Kafka.
    const fts = q.trim().split(/\s+/).map((w) => `"${w.replace(/"/g, '')}"*`).join(' ')
    where.push('c.id IN (SELECT rowid FROM candidates_fts WHERE candidates_fts MATCH ?)'); args.push(fts)
  }
  return db.prepare(`SELECT c.* FROM candidates c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updatedAt DESC, c.id DESC LIMIT ?`).all(...args, limit)
    .map((c) => ({ ...c, pan: maskPan(c.pan) }))
}

export function get(id, { revealPan = false } = {}) {
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id)
  if (!c) return null
  return { ...c, pan: revealPan ? c.pan : maskPan(c.pan), events: db.prepare('SELECT * FROM events WHERE candidateId = ? ORDER BY date DESC, id DESC').all(id) }
}

export function remove(id) {
  db.prepare('DELETE FROM events WHERE candidateId = ?').run(id)
  db.prepare('DELETE FROM candidates_fts WHERE rowid = ?').run(id)
  return db.prepare('DELETE FROM candidates WHERE id = ?').run(id).changes > 0
}

export { FIELD_LABELS, STATUSES }
