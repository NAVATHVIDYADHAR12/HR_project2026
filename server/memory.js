import { findSkills } from './skills.js'

// Turns a free-text recruiter note (typed, spoken or OCR'd) into candidate records. Offline, rule based.

export const STATUSES = ['selected', 'rejected', 'hold', 'moderate', 'eliminated', 'in process']
// Order matters: "not selected" must hit rejected before selected.
const STATUS_RULES = [
  ['rejected', /\b(rejected|not\s+selected|not\s+cleared|declined|failed|dropped|no[\s-]?show|did\s+not\s+clear)\b/i],
  ['eliminated', /\b(eliminated|disqualified|screened\s+out|not\s+eligible)\b/i],
  ['hold', /\b(on\s+hold|hold|keep\s+for\s+later|later\s+reference|parked|future\s+reference)\b/i],
  ['moderate', /\b(moderate|average|borderline|maybe)\b/i],
  ['selected', /\b(selected|offered|offer\s+(?:released|accepted|rolled\s+out)|joined|onboarded|hired)\b/i],
  ['in process', /\b(shortlisted|interview\s+scheduled|in\s+process|next\s+round|scheduled)\b/i],
]

const COMPANIES = ['Infosys', 'TCS', 'Tata Consultancy Services', 'Wipro', 'Accenture', 'HCL', 'HCLTech', 'Tech Mahindra', 'Cognizant', 'Capgemini', 'IBM', 'Deloitte', 'EY', 'KPMG', 'PwC', 'LTIMindtree', 'Mindtree', 'L&T', 'Mphasis', 'Hexaware', 'Persistent', 'Zensar', 'Birlasoft', 'Coforge', 'Cyient', 'Oracle', 'Microsoft', 'Google', 'Amazon', 'Flipkart', 'Paytm', 'Swiggy', 'Zomato', 'Genpact', 'Virtusa', 'NTT Data', 'DXC', 'Atos', 'Sopra Steria', 'UST', 'Nagarro', 'Publicis Sapient', 'Thoughtworks', 'EPAM', 'Synechron', 'Fiserv', 'JPMorgan', 'Goldman Sachs', 'Barclays', 'HSBC', 'Wells Fargo', 'Citi', 'Deutsche Bank', 'Morgan Stanley', 'Siemens', 'Bosch', 'SAP', 'Salesforce', 'Adobe', 'Cisco', 'Dell', 'HP', 'Intel', 'Qualcomm']
const CITIES = ['Hyderabad', 'Bengaluru', 'Bangalore', 'Chennai', 'Mumbai', 'Navi Mumbai', 'Pune', 'Delhi', 'New Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'Kolkata', 'Ahmedabad', 'Kochi', 'Cochin', 'Trivandrum', 'Thiruvananthapuram', 'Coimbatore', 'Mysore', 'Mysuru', 'Mangalore', 'Vizag', 'Visakhapatnam', 'Vijayawada', 'Warangal', 'Indore', 'Bhopal', 'Jaipur', 'Lucknow', 'Chandigarh', 'Mohali', 'Nagpur', 'Nashik', 'Surat', 'Vadodara', 'Bhubaneswar', 'Patna', 'Ranchi', 'Guwahati', 'Dehradun', 'Goa', 'Madurai', 'Tirupati', 'Remote']
const QUALS = [ // highest first
  ['PhD', /\b(ph\.?\s?d|doctorate)\b/i], ['M.Tech', /\bm\.?\s?tech\b|\bm\.?e\.?\b(?=\s|,|$)/i], ['MCA', /\bmca\b/i], ['MBA', /\bmba\b|\bpgdm\b/i],
  ['M.Sc', /\bm\.?\s?sc\b/i], ['M.Com', /\bm\.?\s?com\b/i], ['MA', /\bm\.a\.?\b/i], ['B.Tech', /\bb\.?\s?tech\b|\bb\.?e\.?\b(?=\s|,|$)|\bbachelor of engineering\b/i],
  ['BCA', /\bbca\b/i], ['B.Sc', /\bb\.?\s?sc\b/i], ['B.Com', /\bb\.?\s?com\b/i], ['BBA', /\bbba\b/i], ['BA', /\bb\.a\.?\b/i], ['Diploma', /\bdiploma\b/i], ['12th', /\b(12th|intermediate|hsc)\b/i],
]
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

// "key: value" labels; longer labels first so "expected ctc" wins over "ctc".
const LABELS = Object.entries({
  name: ['candidate name', 'candidate', 'name'],
  email: ['email id', 'e-mail', 'email', 'mail id', 'mail'],
  phone: ['phone number', 'mobile number', 'contact number', 'phone', 'mobile', 'contact', 'ph'],
  status: ['current status', 'status'],
  reason: ['rejection reason', 'remarks', 'remark', 'feedback', 'comments', 'comment', 'reason'],
  company: ['client name', 'hiring for', 'client', 'company'],
  role: ['job title', 'designation', 'position', 'requirement', 'role'],
  notice: ['notice period', 'notice', 'np'],
  ectc: ['expected ctc', 'expected salary', 'ectc', 'expected'],
  ctc: ['current ctc', 'current salary', 'cctc', 'ctc', 'salary'],
  currentCompany: ['current company', 'current employer', 'current organization', 'organization'],
  previousCompany: ['previous company', 'previous employer', 'last company', 'prev company', 'ex company'],
  leavingReason: ['reason for leaving', 'leaving reason', 'rfl', 'reason for change', 'rfc'],
  leavingDate: ['last working day', 'leaving date', 'relieving date', 'lwd', 'left on'],
  jobLocation: ['job location', 'work location', 'preferred location', 'posting location'],
  location: ['current location', 'residence', 'location', 'city'],
  qualification: ['highest qualification', 'qualification', 'education', 'degree'],
  dob: ['date of birth', 'birth date', 'dob', 'd.o.b'],
  pan: ['pan number', 'pan no', 'pan card', 'pan'],
  skills: ['key skills', 'skill set', 'skills'],
  date: ['interview date', 'status date', 'date'],
}).flatMap(([field, labels]) => labels.map((l) => [field, l])).sort((a, b) => b[1].length - a[1].length)
const LABEL_RE = new RegExp(`^\\s*(${LABELS.map(([, l]) => l.replace(/[.-]/g, '\\$&')).join('|')})\\s*[:=\\-–]\\s*(.+)$`, 'i')

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])[a-z]/g, (c) => c.toUpperCase())
const clean = (s) => (s || '').replace(/^[\s,;:-]+|[\s,;:.-]+$/g, '').replace(/\s+/g, ' ')

export function toISODate(s, today = new Date()) {
  if (!s) return ''
  s = s.trim().toLowerCase()
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}${d ? '-' + String(d).padStart(2, '0') : ''}`
  if (/^today\b/.test(s)) return today.toISOString().slice(0, 10)
  if (/^yesterday\b/.test(s)) return new Date(today - 864e5).toISOString().slice(0, 10)
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/)
  if (m) return iso(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/) // Indian dd/mm/yyyy
  if (m) { const y = m[3].length === 2 ? (+m[3] > 40 ? 1900 : 2000) + +m[3] : +m[3]; return +m[2] > 12 ? iso(y, m[1], m[2]) : iso(y, m[2], m[1]) }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})/)
  if (m && MONTHS[m[2].slice(0, 3)]) return iso(m[3], MONTHS[m[2].slice(0, 3)], m[1])
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(m[3], MONTHS[m[1].slice(0, 3)], m[2])
  m = s.match(/^([a-z]{3,9})\.?,?\s+(\d{4})/)
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(m[2], MONTHS[m[1].slice(0, 3)])
  return ''
}

export function toLakhs(s) {
  if (s == null || s === '') return null
  const m = String(s).match(/(\d[\d,]*(?:\.\d+)?)\s*(lacs?|lakhs?|lpa|l\b|k\b|cr|crores?)?/i)
  if (!m) return null
  let n = parseFloat(m[1].replace(/,/g, ''))
  const u = (m[2] || '').toLowerCase()
  if (u.startsWith('cr')) n *= 100
  else if (u === 'k') n /= 100
  else if (!u && n >= 10000) n /= 100000
  return Math.round(n * 100) / 100
}

export function noticeDays(s) {
  if (!s) return null
  if (/immediate|serving|joined/i.test(s)) return /serving/i.test(s) ? 15 : 0
  const m = String(s).match(/(\d{1,3})\s*(days?|d\b|months?|m\b|weeks?|w\b)?/i)
  if (!m) return null
  const u = (m[2] || 'days').toLowerCase()
  return +m[1] * (u.startsWith('m') ? 30 : u.startsWith('w') ? 7 : 1)
}

export function detectStatuses(text) {
  const found = []
  let rest = text
  for (const [status, re] of STATUS_RULES) {
    if (re.test(rest)) { found.push(status); rest = rest.replace(new RegExp(re.source, 'gi'), ' ') } // "not selected" shouldn't also count as selected
  }
  return found
}

const ROLE_WORDS = /(developer|engineer|lead|manager|analyst|tester|architect|consultant|administrator|admin|designer|scientist|specialist|associate|intern|executive|devops|sre)\b/i

function companyFrom(s, knownCompanies) {
  const list = [...new Set([...knownCompanies, ...COMPANIES])].sort((a, b) => b.length - a.length)
  for (const c of list) if (new RegExp(`(?<![\\w])${esc(c)}(?![\\w])`, 'i').test(s)) return c
  return ''
}

/** Split a note into one block per candidate. */
export function splitBlocks(text, knownNames = []) {
  const lines = text.replace(/\r/g, '').split('\n')
  const isForm = lines.filter((l) => LABEL_RE.test(l)).length >= 2
  if (isForm) {
    // Form style: a new person starts at each "Name:" label. Blank lines are ignored (OCR adds them between rows).
    const isName = (l) => /^\s*(candidate name|candidate|name)\s*[:=\-–]/i.test(l)
    const hasNames = lines.some(isName)
    const blocks = [[]]
    for (const l of lines) {
      if (hasNames ? isName(l) && blocks.at(-1).some(isName) : !l.trim()) blocks.push([])
      if (l.trim()) blocks.at(-1).push(l)
    }
    return blocks.filter((b) => b.length).map((b) => b.join('\n'))
  }
  // Prose: sentences; a sentence that names a different person starts a new block.
  const sentences = text.split(/(?<=[.;!?])\s+(?=[A-Z])|\n+/).map((s) => s.trim()).filter(Boolean)
  const blocks = []
  for (const s of sentences) {
    const name = nameIn(s, knownNames)
    if (!blocks.length || (name && blocks.at(-1).name && name.toLowerCase() !== blocks.at(-1).name.toLowerCase())) blocks.push({ name, parts: [s] })
    else { blocks.at(-1).parts.push(s); blocks.at(-1).name ||= name }
  }
  return blocks.map((b) => b.parts.join(' '))
}

const NOT_A_NAME = /^(the|this|that|he|she|they|candidate|today|yesterday|client|company|notice|current|expected|previous|job|lives|based|left|selected|rejected|hold|status|role|interview|java|python|offer|dob|pan|ctc|ectc|reason|remark|location|email|phone|mobile|qualification|skills)$/i

function nameIn(s, knownNames = []) {
  const labelled = s.match(/\b(?:candidate\s+name|name|candidate)\s*[:=-]\s*([A-Za-z][A-Za-z.' ]{1,40}?)(?=\s*(?:[,;|\n]|$|\b(?:is|was|has|got|selected|rejected)\b))/i)
  if (labelled) return clean(titleCase(labelled[1]))
  const lc = s.toLowerCase()
  const known = [...knownNames].sort((a, b) => b.length - a.length).find((n) => n && new RegExp(`(?<![a-z])${esc(n.toLowerCase())}(?![a-z])`).test(lc))
  if (known) return known
  // Capitalised words right before a status verb: "Rahul Sharma got selected", "Anita rejected"
  const m = s.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:'s)?\s+(?:is\s+|was\s+|has\s+been\s+|got\s+|have\s+been\s+)?(?:not\s+)?(?:selected|rejected|on\s+hold|put\s+on\s+hold|hold|shortlisted|eliminated|offered|declined|joined|moderate|dropped|cleared|failed)\b/)
  if (m) {
    const words = m[1].split(/\s+/).filter((w) => !NOT_A_NAME.test(w))
    if (words.length) return words.join(' ')
  }
  // Fallback: a name at the start of the block ("Rahul Sharma, 6 yrs, ...")
  const start = s.match(/^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/)
  if (start && !start[1].split(/\s+/).some((w) => NOT_A_NAME.test(w) || CITIES.includes(w) || COMPANIES.includes(w))) return start[1]
  return ''
}

/** Parse one candidate block. */
export function parseBlock(block, { knownNames = [], knownCompanies = [], today = new Date() } = {}) {
  const f = {}
  const ambiguous = {}
  let text = block

  // 1. Explicit "label: value" lines (forms, OCR'd screenshots of trackers)
  for (const line of block.split('\n')) {
    const m = line.match(LABEL_RE)
    if (!m) continue
    const field = LABELS.find(([, l]) => l.toLowerCase() === m[1].toLowerCase())[0]
    if (f[field] == null) f[field] = clean(m[2])
  }

  // 2. Patterns anywhere in the text
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  if (email) f.email = email[0].toLowerCase()
  for (const m of text.matchAll(/\+?\d[\d \t\-()]{8,16}\d/g)) {
    const d = m[0].replace(/\D/g, '')
    const local = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d
    if (local.length === 10 && /^[6-9]/.test(local)) { f.phone = `+91 ${local.slice(0, 5)} ${local.slice(5)}`; break }
  }
  const pan = text.match(/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/)
  if (pan) f.pan = pan[0].toUpperCase()
  else if (f.pan) f.pan = f.pan.toUpperCase().replace(/\s/g, '')

  // Leaving clause first, so its "due to" isn't taken as the rejection reason.
  const left = text.match(/\b(?:left|resigned\s+from|quit|relieved\s+from)\s+(?:from\s+)?([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3}?)?\s*(?:(?:in|on|by)\s+([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}))?\s*(?:,?\s*(?:due\s+to|because(?:\s+of)?|for|as)\s+([^.;\n]+?))?(?=[.;\n]|,\s*(?:notice|ctc|current|expected|lives|based|location|job|dob|pan|qualification|email|phone)|$)/i)
  if (left && (left[1] || left[2] || left[3])) {
    if (left[1] && !f.previousCompany) f.previousCompany = clean(left[1])
    if (left[2] && !f.leavingDate) f.leavingDate = left[2]
    if (left[3] && !f.leavingReason) f.leavingReason = clean(left[3])
    text = text.replace(left[0], ' ')
  }

  const statuses = f.status ? detectStatuses(f.status) : detectStatuses(text)
  if (statuses.length === 1) f.status = statuses[0]
  else if (statuses.length > 1) { ambiguous.status = statuses; delete f.status }
  else if (f.status && !STATUSES.includes(f.status.toLowerCase())) { ambiguous.status = []; ambiguous.statusText = f.status; delete f.status }

  // A reason ends at punctuation or where the next field starts (speech has no commas).
  const STOP = String.raw`(?=[.;\n]|[,\s]\s*(?:notice|np\b|ctc|current\s+(?:ctc|company|location)|expected|ectc|previous|prev\b|ex-|left\b|lives|based|location|job\s+location|dob\b|pan\b|qualification|b\.?\s?tech|email|phone|mobile|immediate|serving)|$)`
  if (!f.reason) {
    const r = text.match(new RegExp(String.raw`\b(?:because(?:\s+of)?|due\s+to|reason\s*(?:is|was|being)?\s*[:-]?|remarks?\s*[:-])\s+([^.;\n]+?)${STOP}`, 'i'))
    if (r) f.reason = clean(r[1])
  }

  if (!f.company) {
    const after = text.match(/\b(?:selected|rejected|hold|shortlisted|offered|interview(?:ed)?|eliminated|cleared|submitted|profile\s+sent)\s+(?:for|by|at|in|to|with)\s+(?:the\s+)?([\w&.-]+(?:\s+[\w&.-]+){0,3})/i)
    // "selected for Acme Labs Java Developer role" -> capitalised words up to the first role/skill word
    const words = (after?.[1] || '').split(/\s+/)
    const cut = words.findIndex((w, i) => ROLE_WORDS.test(w) || findSkills(w).length || /^(role|position|opening|team|because|due|as|on|today|yesterday)$/i.test(w) || (i > 0 && !/^[A-Z&]/.test(w)))
    const guess = words.slice(0, cut === -1 ? undefined : cut).join(' ')
    f.company = companyFrom(after?.[1] || '', knownCompanies) || (/^[A-Z]/.test(guess) ? clean(guess) : '')
    if (!f.company) {
      const any = companyFrom(text.replace(new RegExp(esc(f.previousCompany || '@@'), 'g'), ''), knownCompanies)
      if (any && !new RegExp(`(?:ex-?|from|worked\\s+(?:at|in|with)|currently\\s+(?:at|in|with)|working\\s+(?:at|in|with))\\s*${esc(any)}`, 'i').test(text)) f.company = any
    }
  }
  if (!f.role) {
    const r = text.match(/\b(?:for|as)\s+(?:an?\s+|the\s+)?([A-Za-z.+#/ ]{2,40}?)\s+(?:role|position|opening|profile|requirement)\b/i) ||
      text.match(/\b(?:for|as)\s+(?:an?\s+|the\s+)?((?:senior\s+|sr\.?\s+|junior\s+|jr\.?\s+|lead\s+)?[A-Za-z.+#/]+(?:\s+[A-Za-z.+#/]+)?\s+(?:developer|engineer|lead|manager|analyst|tester|architect|consultant|administrator|designer|scientist))\b/i)
    if (r) f.role = clean(r[1].replace(new RegExp(`^${esc(f.company || '@@')}\\s*`, 'i'), ''))
  }
  if (!f.currentCompany) {
    const c = text.match(/\b(?:currently\s+(?:at|in|with)|working\s+(?:at|in|with)|current\s+company\s+(?:is\s+)?)\s*([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,2})/)
    if (c) f.currentCompany = companyFrom(c[1], knownCompanies) || clean(c[1])
  }
  if (!f.previousCompany) {
    const p = text.match(/\b(?:[Pp]revious(?:ly)?\s+(?:company\s+(?:is|was)?\s*|at|in|with|worked\s+(?:at|in|with))|[Ee]x-?|[Ww]orked\s+(?:at|in|with)|[Pp]rev(?:ious)?\s+company\s*)\s*([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,2})/)
    if (p) f.previousCompany = companyFrom(p[1], knownCompanies) || clean(p[1])
  }

  if (!f.notice) {
    const n = text.match(/\b(immediate(?:ly)?\s*(?:joiner|available|joining)?|serving\s+notice[^,.;\n]*|(?:notice(?:\s+period)?\s*(?:is|of|:|-)?\s*)(\d{1,3}\s*(?:days?|months?|weeks?))|(\d{1,3}\s*(?:days?|months?))\s+notice)/i)
    if (n) f.notice = clean(n[2] || n[3] || n[1])
  }
  if (!f.ectc) {
    const e = text.match(/\b(?:expected(?:\s+ctc|\s+salary)?|ectc|expecting)\s*(?:is|of|:|-)?\s*((?:rs\.?|inr|₹)?\s*\d[\d,.]*\s*(?:lpa|lakhs?|lacs?|l\b|k\b|cr)?)/i)
    if (e) f.ectc = clean(e[1])
  }
  if (!f.ctc) {
    const c = text.match(/\b(?:current\s+ctc|current\s+salary|cctc|(?<!expected\s{1,3})ctc|drawing|(?<!expected\s{1,3})salary)\s*(?:is|of|:|-)?\s*((?:rs\.?|inr|₹)?\s*\d[\d,.]*\s*(?:lpa|lakhs?|lacs?|l\b|k\b|cr)?)/i)
    if (c) f.ctc = clean(c[1])
  }

  if (!f.jobLocation) {
    const j = text.match(/\b(?:job\s+location|work\s+location|posting|location\s+of\s+job|job\s+(?:is\s+)?(?:in|at)|for\s+(?:the\s+)?([A-Z][a-z]+)\s+office|position\s+(?:in|at))\s*(?:is|:|-)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)?/i)
    if (j) f.jobLocation = clean(j[1] || j[2] || '')
    if (!f.jobLocation) delete f.jobLocation
  }
  if (!f.location) {
    const l = text.match(/\b(?:lives\s+in|living\s+in|based\s+(?:in|out\s+of)|stays\s+in|staying\s+in|resides\s+in|from|current\s+location\s*(?:is|:|-)?|located\s+in|native\s+(?:of|place\s*(?:is|:)?))\s*([A-Za-z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
    if (l && CITIES.some((c) => c.toLowerCase() === l[1].toLowerCase() || l[1].toLowerCase().startsWith(c.toLowerCase()))) f.location = CITIES.find((c) => l[1].toLowerCase().startsWith(c.toLowerCase()))
    else if (l && /lives|living|based|stays|staying|resides|current location|located/i.test(l[0])) f.location = clean(l[1])
  }

  if (!f.qualification) { const q = QUALS.find(([, re]) => re.test(text)); if (q) f.qualification = q[0] }
  else { const q = QUALS.find(([, re]) => re.test(f.qualification)); if (q) f.qualification = q[0] }

  if (!f.dob) {
    const d = text.match(/\b(?:dob|d\.o\.b|date\s+of\s+birth|born\s+on|birth\s*date)\s*(?:is|:|-)?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i)
    if (d) f.dob = d[1]
  }
  if (!f.date) {
    const d = text.match(/\b(today|yesterday|on\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}))\b/i)
    if (d && !/dob|birth/i.test(text.slice(Math.max(0, d.index - 20), d.index))) f.date = d[2] || d[1]
  }
  if (!f.name) f.name = nameIn(block, knownNames)
  if (f.name) f.name = titleCase(clean(f.name))
  if (!f.skills) { const s = findSkills(text); if (s.length) f.skills = s.join(', ') }

  // Normalise
  if (f.dob) f.dob = toISODate(f.dob, today) || f.dob
  if (f.leavingDate) f.leavingDate = toISODate(f.leavingDate, today) || f.leavingDate
  f.date = toISODate(f.date || 'today', today) || today.toISOString().slice(0, 10)
  if (f.notice) f.noticeDays = noticeDays(f.notice)
  if (f.ctc) f.ctcLakhs = toLakhs(f.ctc)
  if (f.ectc) f.ectcLakhs = toLakhs(f.ectc)
  if (f.status) f.status = f.status.toLowerCase()
  for (const k of Object.keys(f)) if (f[k] === '' || f[k] == null) delete f[k]
  return { fields: f, ambiguous }
}

export function parseNote(text, opts = {}) {
  return splitBlocks(text, opts.knownNames).map((b) => ({ block: b, ...parseBlock(b, opts) }))
}

export const FIELD_LABELS = {
  name: 'Name', phone: 'Phone', email: 'Email', status: 'Status', reason: 'Reason / remark', company: 'Client company', role: 'Role',
  notice: 'Notice period', ctc: 'Current CTC', ectc: 'Expected CTC', currentCompany: 'Current company', previousCompany: 'Previous company',
  leavingReason: 'Reason for leaving', leavingDate: 'Left on', location: 'Lives in', jobLocation: 'Job location',
  qualification: 'Highest qualification', dob: 'Date of birth', pan: 'PAN', skills: 'Skills', date: 'Status date',
}
