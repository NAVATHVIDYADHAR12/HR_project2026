import { db } from './db.js'
import { findSkills } from './skills.js'
import { STATUSES } from './memory.js'
import { knownNames, knownCompanies, maskPan } from './candidates.js'

// Ask Memory: question -> filters -> SQL. Offline and deterministic; AI (optional) only fills the same filters.

const STATUS_WORDS = [
  ['in process', /\b(in\s+process|in\s+progress|shortlisted|interview(?:s|ing|ed)?|scheduled|pipeline|ongoing)\b/i],
  ['rejected', /\b(reject(?:ed|ions?)?|not\s+selected|dropped|declined|failed)\b/i],
  ['eliminated', /\b(eliminat(?:ed|ions?)|disqualified|screened\s+out)\b/i],
  ['hold', /\b(on\s+hold|hold|held|parked|kept\s+for\s+later|later\s+reference)\b/i],
  ['moderate', /\b(moderate|average|borderline)\b/i],
  ['selected', /\b(select(?:ed|ions?)?|offered|offers|joined|joinings?|hired|placed|placements?|closures?)\b/i],
]
const EXCLUDE_RE = /\b(?:without|exclud(?:e|ing)|remove|removing|except|minus|but\s+not|not\s+(?:already|yet)|skip(?:ping)?|other\s+than|apart\s+from|filter\s+out|leave\s+out|no)\s+((?:(?:already|the|any|previously|ones?|candidates?|people|those|who\s+(?:are|were|got))\s+)*(?:(?:selected|rejected|hold|on\s+hold|moderate|eliminated|joined|offered|placed|in\s+process|shortlisted)(?:\s*(?:,|and|or|&|\/)\s*(?:already\s+)?)?)+)/gi
const CITIES = ['Hyderabad', 'Bengaluru', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'Kolkata', 'Ahmedabad', 'Kochi', 'Trivandrum', 'Coimbatore', 'Mysore', 'Vizag', 'Visakhapatnam', 'Vijayawada', 'Indore', 'Jaipur', 'Lucknow', 'Chandigarh', 'Nagpur', 'Bhubaneswar', 'Remote']
const COMMON_COMPANIES = ['Infosys', 'TCS', 'Wipro', 'Accenture', 'HCL', 'Tech Mahindra', 'Cognizant', 'Capgemini', 'IBM', 'Deloitte', 'LTIMindtree', 'Mphasis', 'Hexaware', 'Persistent', 'Virtusa', 'Genpact', 'Oracle', 'Microsoft', 'Google', 'Amazon', 'EY', 'KPMG', 'PwC']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 864e5)

export function statusesIn(text) {
  const out = []
  let rest = text
  for (const [s, re] of STATUS_WORDS) if (re.test(rest)) { out.push(s); rest = rest.replace(new RegExp(re.source, 'gi'), ' ') }
  return out
}

export function dateRange(q, today = new Date()) {
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const lc = q.toLowerCase()
  if (/\btoday\b/.test(lc)) return { from: iso(t), to: iso(t), label: 'today' }
  if (/\byesterday\b/.test(lc)) return { from: iso(addDays(t, -1)), to: iso(addDays(t, -1)), label: 'yesterday' }
  let m = lc.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(days?|weeks?|months?)\b/)
  if (m) { const n = +m[1] * (m[2].startsWith('w') ? 7 : m[2].startsWith('m') ? 30 : 1); return { from: iso(addDays(t, -n + 1)), to: iso(t), label: `last ${m[1]} ${m[2]}` } }
  const dow = (t.getUTCDay() + 6) % 7 // Monday = 0
  if (/\bthis\s+week\b/.test(lc)) return { from: iso(addDays(t, -dow)), to: iso(t), label: 'this week' }
  if (/\blast\s+week\b/.test(lc)) return { from: iso(addDays(t, -dow - 7)), to: iso(addDays(t, -dow - 1)), label: 'last week' }
  const monthStart = (y, mo) => new Date(Date.UTC(y, mo, 1))
  if (/\bthis\s+month\b/.test(lc)) return { from: iso(monthStart(t.getUTCFullYear(), t.getUTCMonth())), to: iso(t), label: 'this month' }
  if (/\blast\s+month\b/.test(lc)) { const s = monthStart(t.getUTCFullYear(), t.getUTCMonth() - 1); return { from: iso(s), to: iso(addDays(monthStart(t.getUTCFullYear(), t.getUTCMonth()), -1)), label: 'last month' } }
  if (/\bthis\s+year\b/.test(lc)) return { from: `${t.getUTCFullYear()}-01-01`, to: iso(t), label: 'this year' }
  if (/\blast\s+year\b/.test(lc)) return { from: `${t.getUTCFullYear() - 1}-01-01`, to: `${t.getUTCFullYear() - 1}-12-31`, label: 'last year' }
  // "in october", "in oct 2026", "during march"
  m = lc.match(/\b(?:in|during|for|of)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/)
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3))
    let y = m[2] ? +m[2] : t.getUTCFullYear()
    if (!m[2] && mo > t.getUTCMonth()) y-- // "in December" asked in November = last December
    const s = monthStart(y, mo)
    return { from: iso(s), to: iso(addDays(monthStart(y, mo + 1), -1)), label: `${m[1][0].toUpperCase() + m[1].slice(1, 3)} ${y}` }
  }
  // "since 1 nov", "after 2026-10-01", "from 5/10/2026"
  m = lc.match(/\b(?:since|after|from)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?/)
  if (m) { const s = new Date(Date.UTC(m[3] ? +m[3] : t.getUTCFullYear(), MONTHS.indexOf(m[2]), +m[1])); return { from: iso(s), to: iso(t), label: `since ${iso(s)}` } }
  m = lc.match(/\b(?:since|after|from)\s+(\d{4}-\d{2}-\d{2})/)
  if (m) return { from: m[1], to: iso(t), label: `since ${m[1]}` }
  return null
}

/** Turn a question into filters. */
export function parseQuestion(q, { names = knownNames(), companies = knownCompanies(), today = new Date() } = {}) {
  const f = { statuses: [], excludeStatuses: [], companies: [], excludeCompanies: [], skills: [], names: [], locations: [] }
  let rest = ` ${q} `

  for (const m of q.matchAll(EXCLUDE_RE)) {
    for (const s of statusesIn(m[1])) if (!f.excludeStatuses.includes(s)) f.excludeStatuses.push(s)
    rest = rest.replace(m[0], ' ')
  }
  const exclCo = q.match(/\b(?:except|excluding|without|not\s+(?:for|from|at))\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)?)/)

  const companyList = [...new Set([...companies, ...COMMON_COMPANIES])].sort((a, b) => b.length - a.length)
  for (const c of companyList) {
    const re = new RegExp(`(?<![\\w])${esc(c)}(?![\\w])`, 'i')
    if (!re.test(rest)) continue
    if (exclCo && re.test(exclCo[1])) f.excludeCompanies.push(c)
    else f.companies.push(c)
    rest = rest.replace(new RegExp(re.source, 'gi'), ' ')
  }
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![a-z])${esc(n.toLowerCase())}(?![a-z])`)
    if (n && re.test(rest.toLowerCase())) { f.names.push(n); rest = rest.replace(new RegExp(re.source, 'gi'), ' ') }
  }
  for (const c of CITIES) if (new RegExp(`\\b(?:in|from|at|located|lives?|living|based|stays?)\\s+(?:in\\s+)?${c}\\b`, 'i').test(rest)) f.locations.push(c)

  f.statuses = statusesIn(rest)
  f.skills = findSkills(rest).filter((s) => !['go', 'r'].includes(s))
  const dr = dateRange(q, today)
  if (dr) Object.assign(f, { dateFrom: dr.from, dateTo: dr.to, dateLabel: dr.label })

  if (/\bimmediate(?:ly)?\b|\bimmediate\s+joiners?\b/i.test(q)) f.maxNotice = 15
  // "less than/under/below" is strict; "within/up to/max" includes the number.
  const strict = (w) => /less|under|below|^<$/i.test(w)
  const nm = q.match(/notice\s+(?:period\s+)?(?:of\s+)?(less\s+than|under|below|within|<=|<|upto|up\s+to|max(?:imum)?)\s+(\d{1,3})\s*(days?|months?)?/i)
  if (nm) f.maxNotice = +nm[2] * (/month/i.test(nm[3] || '') ? 30 : 1) - (strict(nm[1]) ? 1 : 0)
  const cm = q.match(/(?:expected\s+)?(?:ctc|salary|package)\s+(?:of\s+)?(less\s+than|under|below|within|<=|<|upto|up\s+to|max(?:imum)?)\s+(\d{1,3}(?:\.\d+)?)/i)
  if (cm) f.maxEctc = +cm[2] - (strict(cm[1]) ? 0.01 : 0)

  const lc = q.toLowerCase()
  f.intent =
    /\b(how\s+many|count|number\s+of|total|no\.?\s+of)\b/.test(lc) ? 'count'
    : /\b(why|reason|reasons)\b/.test(lc) ? 'why'
    : f.names.length && !f.statuses.length && /\b(detail|details|about|info|information|profile|status\s+of|what\s+(?:is|about)|tell)\b|^\s*\S+(?:\s+\S+)?\s*\??\s*$/.test(lc) ? 'detail'
    : /\b(recent|recently|latest|last|newest)\b/.test(lc) && !dr ? 'recent'
    : 'list'
  f.export = /\b(tracker|excel|xlsx|spreadsheet|sheet|export|download|pdf|word|docx)\b/.test(lc)
  f.exportFormat = /\bpdf\b/.test(lc) ? 'pdf' : /\b(word|docx)\b/.test(lc) ? 'docx' : 'xlsx'
  const lim = lc.match(/\b(?:top|last|latest|recent|first)\s+(\d{1,3})\b/)
  f.limit = lim ? +lim[1] : f.intent === 'recent' ? 5 : 500
  // Words left over (not a status/company/name/skill/date): used as a full-text search when nothing else matched.
  const STOP = /\b(how|many|much|who|whom|what|which|when|where|why|is|are|was|were|the|a|an|of|for|to|in|on|at|by|with|and|or|me|show|list|give|get|send|tell|all|candidates?|people|ones|profiles?|till|now|so|far|until|date|dates|current|currently|already|yet|recent|recently|latest|last|this|that|these|those|month|week|year|today|yesterday|did|do|does|have|has|had|we|our|us|i|my|count|number|total|status|details?|about|please|pls|plz|list|table|tracker|reason|reasons|them|their|they|any|got|be|been|put|kept|from|there|filter|filtered|excel|xlsx|sheet|spreadsheet|export|download|format|file|pdf|word|docx|document|as)\b/gi
  const leftover = rest.replace(/[^\w\s+#.]/g, ' ').replace(STOP, ' ').replace(/\b\d+\b/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  f.text = leftover.join(' ')
  return f
}

/** Run filters against memory. Returns rows for display. */
export function run(f) {
  const usesHistory = f.companies.length || f.dateFrom || (f.statuses.length && (f.intent === 'why' || f.excludeCompanies.length))
  const where = [], args = []
  let from = 'candidates c', pick = 'c.*, c.status AS evStatus, c.company AS evCompany, c.statusDate AS evDate, c.reason AS evReason, c.role AS evRole'

  if (usesHistory) {
    // Match on what happened (events), keeping each candidate's latest matching event.
    const ew = ['e.candidateId = c.id']
    if (f.statuses.length) { ew.push(`e.status IN (${f.statuses.map(() => '?').join(',')})`); args.push(...f.statuses) }
    if (f.companies.length) { ew.push(`(${f.companies.map(() => 'lower(e.company) = lower(?)').join(' OR ')})`); args.push(...f.companies) }
    if (f.dateFrom) { ew.push('e.date >= ?', 'e.date <= ?'); args.push(f.dateFrom, f.dateTo) }
    if (!f.statuses.length) ew.push('e.status IS NOT NULL')
    from = `candidates c JOIN events e ON e.id = (SELECT e.id FROM events e WHERE ${ew.join(' AND ')} ORDER BY e.date DESC, e.id DESC LIMIT 1)`
    pick = 'c.*, e.status AS evStatus, e.company AS evCompany, e.date AS evDate, e.reason AS evReason, e.role AS evRole'
  } else if (f.statuses.length) {
    where.push(`c.status IN (${f.statuses.map(() => '?').join(',')})`); args.push(...f.statuses)
  }
  if (f.excludeStatuses.length) {
    // "Already selected" = ever selected, not just currently.
    where.push(`c.id NOT IN (SELECT candidateId FROM events WHERE status IN (${f.excludeStatuses.map(() => '?').join(',')})) AND coalesce(c.status,'') NOT IN (${f.excludeStatuses.map(() => '?').join(',')})`)
    args.push(...f.excludeStatuses, ...f.excludeStatuses)
  }
  if (f.excludeCompanies.length) {
    where.push(`c.id NOT IN (SELECT candidateId FROM events WHERE ${f.excludeCompanies.map(() => 'lower(company) = lower(?)').join(' OR ')})`)
    args.push(...f.excludeCompanies)
  }
  if (f.names.length) { where.push(`lower(c.name) IN (${f.names.map(() => 'lower(?)').join(',')})`); args.push(...f.names) }
  for (const s of f.skills) { where.push(`c.id IN (SELECT rowid FROM candidates_fts WHERE candidates_fts MATCH ?)`); args.push(`"${s.replace(/"/g, '')}"`) }
  if (f.locations.length) { where.push(`(${f.locations.map(() => '(lower(c.location) LIKE lower(?) OR lower(c.jobLocation) LIKE lower(?))').join(' OR ')})`); f.locations.forEach((l) => args.push(`%${l}%`, `%${l}%`)) }
  if (f.maxNotice != null) { where.push('c.noticeDays IS NOT NULL AND c.noticeDays <= ?'); args.push(f.maxNotice) }
  if (f.maxEctc != null) { where.push('c.ectcLakhs IS NOT NULL AND c.ectcLakhs <= ?'); args.push(f.maxEctc) }
  const structured = f.statuses.length || f.companies.length || f.names.length || f.skills.length || f.locations.length || f.dateFrom || f.excludeStatuses.length || f.maxNotice != null || f.maxEctc != null
  if (!structured && f.text) {
    where.push('c.id IN (SELECT rowid FROM candidates_fts WHERE candidates_fts MATCH ?)')
    args.push(f.text.split(/\s+/).map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR '))
  }
  const sql = `SELECT ${pick} FROM ${from} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY evDate DESC, c.updatedAt DESC LIMIT ?`
  return db.prepare(sql).all(...args, f.limit || 500).map((r) => ({ ...r, pan: maskPan(r.pan) }))
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function describe(f) {
  const bits = []
  if (f.statuses.length) bits.push(f.statuses.map(cap).join(' or '))
  if (f.companies.length) bits.push(`for ${f.companies.join(' / ')}`)
  if (f.skills.length) bits.push(`with ${f.skills.join(', ')}`)
  if (f.locations.length) bits.push(`in ${f.locations.join(' / ')}`)
  if (f.names.length) bits.push(f.names.join(', '))
  if (f.dateLabel) bits.push(f.dateLabel)
  if (f.maxNotice != null) bits.push(f.maxNotice === 15 ? 'immediate joiners (can join within 15 days)' : `notice ≤ ${f.maxNotice} days`)
  if (f.maxEctc != null) bits.push(`expected CTC ≤ ${Math.round(f.maxEctc * 10) / 10} L`)
  if (f.excludeStatuses.length) bits.push(`excluding anyone ${f.excludeStatuses.join(' / ')}`)
  if (f.excludeCompanies.length) bits.push(`excluding ${f.excludeCompanies.join(' / ')}`)
  if (!bits.length && f.text) bits.push(`matching “${f.text}”`)
  return bits.join(' · ') || 'everyone in memory'
}

/** Build the human answer + table. */
export function answer(f, rows) {
  const what = describe(f)
  const cols = ['name', 'evStatus', 'evCompany', 'evRole', 'evDate']
  if (f.intent === 'why' || f.statuses.some((s) => ['rejected', 'hold', 'eliminated'].includes(s)) || f.excludeStatuses.length) cols.push('evReason')
  cols.push('notice', 'ectc', 'location', 'phone', 'email')

  if (!rows.length) return { text: `No one found. I looked for: ${what}.`, columns: [], rows: [], count: 0 }

  if (f.intent === 'detail' && rows.length === 1) {
    const c = rows[0]
    const events = db.prepare('SELECT * FROM events WHERE candidateId = ? ORDER BY date DESC, id DESC').all(c.id)
    const facts = [c.role && `role ${c.role}`, c.notice && `notice ${c.notice}`, c.ctc && `CTC ${c.ctc}`, c.ectc && `expects ${c.ectc}`, c.location && `lives in ${c.location}`, c.jobLocation && `job in ${c.jobLocation}`, c.previousCompany && `ex-${c.previousCompany}`].filter(Boolean)
    return {
      text: `${c.name} is currently ${cap(c.status) || 'without a status'}${c.company ? ` for ${c.company}` : ''}${c.statusDate ? ` (since ${c.statusDate})` : ''}${c.reason ? ` — ${c.reason}` : ''}.${facts.length ? ` ${cap(facts.join(', '))}.` : ''}`,
      detail: { ...c, events }, columns: [], rows: [], count: 1,
    }
  }
  if (f.intent === 'count') {
    const byStatus = {}, byCompany = {}
    for (const r of rows) { byStatus[r.evStatus || 'no status'] = (byStatus[r.evStatus || 'no status'] || 0) + 1; if (r.evCompany) byCompany[r.evCompany] = (byCompany[r.evCompany] || 0) + 1 }
    const split = Object.keys(byStatus).length > 1 ? ` (${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ')})` : ''
    const coSplit = Object.keys(byCompany).length > 1 ? ` By client: ${Object.entries(byCompany).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}.` : ''
    return { text: `${plural(rows.length, 'candidate')}${split} — ${what}.${coSplit}`, columns: cols, rows, count: rows.length }
  }
  const lead = f.intent === 'recent' ? `Most recent ${plural(rows.length, 'candidate')}` : `${plural(rows.length, 'candidate')}`
  return { text: `${lead} — ${what}.`, columns: cols, rows, count: rows.length }
}

export function ask(q, opts = {}) {
  const f = opts.filters || parseQuestion(q, opts)
  return { filters: f, ...answer(f, run(f)) }
}

export const COLUMN_LABELS = { name: 'Name', evStatus: 'Status', evCompany: 'Client', evRole: 'Role', evDate: 'Date', evReason: 'Reason', notice: 'Notice', ectc: 'Exp. CTC', location: 'Lives in', phone: 'Phone', email: 'Email' }
export { STATUSES }
