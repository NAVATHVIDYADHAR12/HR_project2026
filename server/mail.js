import nodemailer from 'nodemailer'
import JSZip from 'jszip'
import { db } from './db.js'
import { parseJD } from './match.js'
import { findSkills } from './skills.js'
import { mailMethod, graphTransport } from './outlook.js'

// F10: mail drop. Templates use {placeholders}; nothing is sent without an explicit send call from the UI.

export const PLACEHOLDERS = ['name', 'firstName', 'role', 'company', 'skills', 'experience', 'location', 'notice', 'salary']
const CITIES = ['Hyderabad', 'Bengaluru', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'Kolkata', 'Ahmedabad', 'Kochi', 'Trivandrum', 'Coimbatore', 'Indore', 'Jaipur', 'Chandigarh', 'Remote']

/** Pull role details out of a JD for the placeholders. Everything is editable in the UI afterwards. */
export function jdDetails(jd) {
  const text = String(jd || '')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const p = parseJD(text)
  const label = (re) => text.match(re)?.[1]?.trim().replace(/[.;]+$/, '') || ''
  let role = label(/\b(?:role|position|designation|job\s+title|hiring\s+for)\s*[:\-]\s*([^\n,|]+)/i)
  if (!role) {
    const first = lines[0] || ''
    const m = first.match(/^(?:we\s+are\s+)?(?:hiring|looking\s+for|urgent(?:ly)?\s+(?:hiring|required|requirement)?|opening\s+for|requirement\s+for)?\s*:?\s*(?:an?\s+)?([A-Za-z.+#/ ]{3,60}?)(?:\s*[-–,(|]|\s+(?:at|in|for|with)\s|$)/i)
    role = m?.[1]?.trim() || ''
  }
  const company = label(/\b(?:client|company|organisation|organization|employer)\s*[:\-]\s*([^\n,|]+)/i)
  const location = label(/\b(?:location|job\s+location|work\s+location)\s*[:\-]\s*([^\n|]+)/i) || CITIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)).join(' / ')
  const experience = p.minYears ? (p.maxYears ? `${p.minYears}-${p.maxYears} years` : `${p.minYears}+ years`) : ''
  const notice = label(/\b(?:notice(?:\s+period)?)\s*[:\-]\s*([^\n|]+)/i)
  const salary = label(/\b(?:ctc|salary|package|budget)\s*[:\-]\s*([^\n|]+)/i)
  const titled = (s) => s.replace(/\b(java|python|aws|sql|api|ui|ux|qa|devops|sap|\.net|ios)\b/gi, (w) => w.toUpperCase() === 'IOS' ? 'iOS' : /^\.net$/i.test(w) ? '.NET' : w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
  return {
    role: titled(role), company, location, experience, notice, salary,
    skills: p.skills.filter((s) => !p.niceToHave.includes(s)).map(skillLabel).join(', '),
  }
}

const ACRONYMS = new Set(['aws', 'sql', 'gcp', 'etl', 'nlp', 'api', 'ui/ux', 'ci/cd', 'sap', 'php', 'css', 'html', 'sre', 'qa', 'ml', 'ai'])
const SPECIAL = { '.net': '.NET', 'c#': 'C#', 'c++': 'C++', 'node.js': 'Node.js', 'next.js': 'Next.js', 'mongodb': 'MongoDB', 'postgresql': 'PostgreSQL', 'mysql': 'MySQL', 'graphql': 'GraphQL', 'javascript': 'JavaScript', 'typescript': 'TypeScript', 'power bi': 'Power BI' }
const skillLabel = (s) => SPECIAL[s] || s.split(' ').map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')

/** Replace {placeholders}. Unknown/empty ones are reported so the user can fix them before sending. */
export function fill(text, values) {
  const missing = new Set()
  const out = String(text || '').replace(/\{\s*(\w+)\s*\}/g, (m, key) => {
    const k = PLACEHOLDERS.find((p) => p.toLowerCase() === key.toLowerCase())
    if (!k) return m
    const v = values[k]
    if (v == null || String(v).trim() === '') { missing.add(k); return k === 'firstName' || k === 'name' ? 'there' : '' }
    return v
  })
  return { text: out.replace(/[ \t]+([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' '), missing: [...missing] }
}

export function render(tpl, details, person) {
  const values = { ...details, name: person.name || '', firstName: (person.name || '').split(/\s+/)[0] || '' }
  const s = fill(tpl.subject, values), b = fill(tpl.body, values)
  return { subject: s.text, body: b.text, missing: [...new Set([...s.missing, ...b.missing])] }
}

const isEmail = (e) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(e)

/**
 * Names (or emails) typed by the user -> recipients. Looks in candidate memory first, then uploaded resumes.
 * status: ok | choose (several people) | noemail (found, no email) | notfound
 */
export function resolveRecipients(text) {
  const entries = String(text || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 300)
  const byName = db.prepare('SELECT id, name, email, status, company FROM candidates WHERE lower(name) = lower(?)')
  const byPart = db.prepare("SELECT id, name, email, status, company FROM candidates WHERE lower(name) LIKE lower(?) || ' %' OR lower(name) LIKE '% ' || lower(?)")
  const resumeByName = db.prepare("SELECT id, name, email FROM resumes WHERE lower(name) = lower(?) AND email <> ''")
  const resumePart = db.prepare("SELECT id, name, email FROM resumes WHERE (lower(name) LIKE lower(?) || ' %' OR lower(name) LIKE '% ' || lower(?)) AND email <> ''")
  const byEmail = db.prepare('SELECT id, name, email FROM candidates WHERE lower(email) = lower(?)')
  return entries.map((input) => {
    const em = input.match(/[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i)?.[0]
    if (em) {
      const c = byEmail.get(em)
      const name = c?.name || input.replace(em, '').replace(/[<>()"]/g, '').trim()
      return { input, status: 'ok', name, email: em.toLowerCase(), candidateId: c?.id || null, source: c ? 'memory' : 'typed' }
    }
    let hits = byName.all(input).map((c) => ({ ...c, source: 'memory' }))
    if (!hits.length) hits = byPart.all(input, input).map((c) => ({ ...c, source: 'memory' }))
    // Resumes fill in people not yet in memory (or memory entries without an email).
    const resumes = [...resumeByName.all(input), ...(hits.length ? [] : resumePart.all(input, input))]
    for (const r of resumes) {
      const same = hits.find((h) => h.name.toLowerCase() === r.name.toLowerCase())
      if (same && !same.email) same.email = r.email
      else if (!same) hits.push({ id: null, resumeId: r.id, name: r.name, email: r.email, source: 'resume' })
    }
    // Same person in memory and resumes with the same email counts once.
    hits = hits.filter((h, i) => hits.findIndex((x) => x.name.toLowerCase() === h.name.toLowerCase() && (x.email || '') === (h.email || '')) === i)
    if (!hits.length) return { input, status: 'notfound', name: input, email: '' }
    if (hits.length > 1) return { input, status: 'choose', name: input, email: '', options: hits.map((h) => ({ candidateId: h.id, name: h.name, email: h.email || '', label: [h.name, h.email || 'no email', h.status, h.company].filter(Boolean).join(' · ') })) }
    const h = hits[0]
    return { input, status: h.email ? 'ok' : 'noemail', name: h.name, email: h.email || '', candidateId: h.id, source: h.source }
  })
}

// ---- Settings (SMTP). The password is stored locally and never sent back to the browser.
const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
export const SMTP_PRESETS = {
  outlook: { host: 'smtp.office365.com', port: 587, secure: false, label: 'Outlook / Microsoft 365' },
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true, label: 'Gmail / Google Workspace' },
  custom: { host: '', port: 587, secure: false, label: 'Other (custom SMTP)' },
}
export function getSmtp() { return JSON.parse(getSetting('smtp') || '{}') }
export function publicSmtp() { const s = getSmtp(); return { preset: s.preset || 'outlook', host: s.host || '', port: s.port || 587, secure: !!s.secure, user: s.user || '', fromName: s.fromName || '', hasPassword: !!s.pass } }
export function saveSmtp(input) {
  const cur = getSmtp()
  const next = {
    preset: SMTP_PRESETS[input.preset] ? input.preset : cur.preset || 'outlook',
    host: String(input.host ?? cur.host ?? '').trim(), port: Number(input.port ?? cur.port) || 587, secure: input.secure ?? cur.secure ?? false,
    user: String(input.user ?? cur.user ?? '').trim(), fromName: String(input.fromName ?? cur.fromName ?? '').trim().slice(0, 80),
    pass: input.pass === undefined ? cur.pass : String(input.pass).replace(/\s+/g, ''), // app passwords are shown with spaces
  }
  if (!next.pass) delete next.pass
  setSetting('smtp', JSON.stringify(next))
  return publicSmtp()
}
export function transport(cfg = getSmtp()) {
  if (!cfg.host || !cfg.user || !cfg.pass) throw Object.assign(new Error('Set up your email account first (Send settings).'), { status: 400 })
  return nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: !!cfg.secure, auth: { user: cfg.user, pass: cfg.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 })
}
export function friendlySmtpError(e) {
  const m = e.message || String(e)
  if (/535|auth|credentials|Username and Password not accepted/i.test(m)) return `Login refused. Use an app password (not your normal password). For Outlook, SMTP sending must be allowed for your mailbox. (${m.slice(0, 120)})`
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Mail server not found. Check the server name and your internet.'
  if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(m)) return 'Could not reach the mail server (blocked port or no internet).'
  return m.slice(0, 200)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Send one by one (a burst of identical mails looks like spam to Outlook/Gmail). */
export async function sendAll(messages, { transporter, gapMs = 1500, role = '' } = {}) {
  const cfg = getSmtp()
  // Signed in with Microsoft → send through Outlook (Graph); otherwise the SMTP app-password account.
  const viaOutlook = !transporter && mailMethod() === 'microsoft'
  const t = transporter || (viaOutlook ? graphTransport() : transport(cfg))
  const how = viaOutlook ? 'outlook' : 'smtp'
  const from = cfg.fromName ? `"${cfg.fromName.replace(/"/g, '')}" <${cfg.user}>` : cfg.user
  const results = []
  for (const [i, m] of messages.entries()) {
    if (!isEmail(m.email)) { results.push({ ...m, ok: false, error: 'Invalid email address' }); log(m, how, 'failed', 'Invalid email address', role); continue }
    try {
      await t.sendMail({ from, to: m.name ? `"${m.name.replace(/"/g, '')}" <${m.email}>` : m.email, subject: m.subject, text: m.body, _m: m })
      results.push({ ...m, ok: true }); log(m, how, 'sent', null, role)
    } catch (e) {
      const error = viaOutlook ? e.message : friendlySmtpError(e)
      results.push({ ...m, ok: false, error }); log(m, how, 'failed', error, role)
      if (/Login refused|not found|reach|Sign in|isn’t allowed/.test(error)) { // the account itself is broken: stop instead of failing every mail
        for (const rest of messages.slice(i + 1)) results.push({ ...rest, ok: false, error: 'Not sent (stopped after the error above)' })
        break
      }
    }
    if (i < messages.length - 1 && gapMs) await sleep(gapMs)
  }
  return results
}

// Outlook opens a .eml with "X-Unsent: 1" as a ready-to-send draft. No password needed.
export function eml(m, from = '') {
  const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`)
  const to = m.name ? `${enc(`"${m.name.replace(/"/g, '')}"`)} <${m.email}>` : m.email
  return [
    'X-Unsent: 1', `To: ${to}`, ...(from ? [`From: ${from}`] : []), `Subject: ${enc(m.subject)}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(m.body.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n')
}
export async function draftsZip(messages, role = '') {
  const zip = new JSZip()
  const used = new Set()
  for (const m of messages) {
    let base = (m.name || m.email).replace(/[^\w .-]+/g, '').trim().slice(0, 60) || 'mail'
    while (used.has(base.toLowerCase())) base += '_'
    used.add(base.toLowerCase())
    zip.file(`${base}.eml`, eml(m, getSmtp().user || ''))
    log(m, 'outlook-draft', 'drafted', null, role)
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

function log(m, method, status, error, role) {
  db.prepare('INSERT INTO mails (candidateId, name, email, subject, role, method, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(m.candidateId || null, m.name || '', m.email || '', m.subject || '', role || '', method, status, error)
  // Show it in the candidate's history too.
  if (m.candidateId && status !== 'failed')
    db.prepare('INSERT INTO events (candidateId, date, status, company, role, reason, note) VALUES (?, ?, NULL, NULL, ?, ?, ?)')
      .run(m.candidateId, new Date().toISOString().slice(0, 10), role || null, `Mail ${status === 'sent' ? 'sent' : 'drafted'}: ${m.subject}`.slice(0, 300), `mail:${method}`)
}

export { log as logMail }
export const mailLog = (limit = 100) => db.prepare('SELECT * FROM mails ORDER BY id DESC LIMIT ?').all(limit)

// Templates
export const listTemplates = () => db.prepare('SELECT * FROM mail_templates ORDER BY id DESC').all()
export function saveTemplate({ id, name, subject, body }) {
  if (!String(name || '').trim()) throw Object.assign(new Error('Give the template a name.'), { status: 400 })
  if (!String(body || '').trim()) throw Object.assign(new Error('The template is empty.'), { status: 400 })
  const v = [String(name).trim().slice(0, 100), String(subject || '').slice(0, 300), String(body).slice(0, 20000)]
  if (id) { db.prepare('UPDATE mail_templates SET name = ?, subject = ?, body = ? WHERE id = ?').run(...v, id); return id }
  return Number(db.prepare('INSERT INTO mail_templates (name, subject, body) VALUES (?, ?, ?)').run(...v).lastInsertRowid)
}
export const deleteTemplate = (id) => db.prepare('DELETE FROM mail_templates WHERE id = ?').run(id).changes > 0

// ---- Offline rewrite: turn an old mail's job details into {placeholders}, keeping the recruiter's wording.
const ROLE_RE = /(?<![\w.#+])(?:(?:Senior|Sr\.?|Junior|Jr\.?|Lead|Principal|Staff|Associate)\s+)?(?:[A-Z.][\w.+#/-]*\s+){0,3}(?:Developer|Engineer|Consultant|Analyst|Architect|Manager|Tester|Administrator|Admin|Designer|Scientist|Specialist|Programmer|Lead)s?\b/g
const EXP_RE = /\b\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*\+?\s*(?:years?|yrs?)\b|\b\d+(?:\.\d+)?\s*\+\s*(?:years?|yrs?)\b|\b\d+(?:\.\d+)?\s*(?:years?|yrs?)\b(?=\s+(?:of\s+)?(?:exp|experience|with|in)\b)/gi
const CITY_RE = new RegExp(`\\b(?:${CITIES.join('|')})\\b(?:\\s*(?:/|,|&|or|and)\\s*\\b(?:${CITIES.join('|')})\\b)*`, 'gi')
const LOOSE = new Set(['go', 'express', 'swift', 'rest api']) // also everyday words; only replaced inside a list of skills
const SIGNOFF = /^\s*(regards|best regards|warm regards|kind regards|thanks|thank you|thanks & regards|thanks and regards|cheers|sincerely)\b/im

function skillsToPlaceholder(text) {
  const words = [...text.matchAll(/\.?[A-Za-z][\w.+#-]*/g)].map((m) => ({ w: m[0].replace(/[.]+$/, ''), i: m.index }))
  const spans = []
  for (let k = 0; k < words.length; k++) {
    if (text[words[k].i - 1] === '{') continue // already a placeholder
    const one = findSkills(words[k].w)
    const two = words[k + 1] && text.slice(words[k].i, words[k + 1].i).match(/^\S+ $/) ? `${words[k].w} ${words[k + 1].w}` : null
    // A two-word skill ("Spring Boot", "Power BI") only when the pair names something the first word alone doesn't.
    const suffix = one.length && /^(?:Server|Core|MVC|Framework|Cloud|Services|JS|Native|Studio|API|APIs)$/.test(words[k + 1]?.w || '')
    const pick = (two && (suffix || findSkills(two).some((s) => !one.includes(s) && !findSkills(words[k + 1].w).includes(s))) ? [two, 2] : null) || (one.length ? [words[k].w, 1] : null)
    if (!pick) continue
    const end = words[k + pick[1] - 1].i + words[k + pick[1] - 1].w.length
    spans.push({ start: words[k].i, end, loose: findSkills(pick[0]).every((s) => LOOSE.has(s)) })
    k += pick[1] - 1
  }
  // Join neighbours separated by "," "/" "&" "and" into one list.
  const groups = []
  for (const s of spans) {
    const last = groups.at(-1)
    if (last && /^\s*(?:,|\/|&|and|,\s*and)\s*$/i.test(text.slice(last.end, s.start))) { last.end = s.end; last.n++; last.loose &&= s.loose }
    else groups.push({ ...s, n: 1 })
  }
  let out = text
  for (const g of groups.reverse()) if (g.n > 1 || !g.loose) out = out.slice(0, g.start) + '{skills}' + out.slice(g.end)
  return out.replace(/\{skills\}(?:\s*(?:,|\/|&|and)\s*\{skills\})+/g, '{skills}')
}

/** "Hi Ravi," -> "Ravi" (not "Hi Team" / "Dear Sir"). */
export const greetName = (body) => String(body).match(/^\s*(?:hi|hello|dear|hey|greetings)\s+(?:mr\.?\s+|ms\.?\s+|mrs\.?\s+)?(?!(?:Team|All|There|Sir|Madam|Candidate|Friend)s?\b)([A-Z][a-z]+)\b/im)?.[1]

/** Old mail -> template. Returns what was swapped so the UI can tell the user. */
export function templatize(subject, body) {
  const swapped = new Set()
  const greet = greetName(body)
  const sw = (s, re, ph) => s.replace(re, (m) => { swapped.add(ph); return `{${ph}}` })
  const job = (s) => {
    s = sw(s, ROLE_RE, 'role')
    s = sw(s, EXP_RE, 'experience')
    s = sw(s, CITY_RE, 'location')
    s = s.replace(/\b(at|with|for|client:?)\s+((?:[A-Z][A-Za-z0-9&.-]+)(?:\s+(?:[A-Z][A-Za-z0-9&.-]+|&))*)/g, (m, pre, name) => {
      if (/^(?:I|We|Our|The|This|You|Your|Let|Please|Senior|Immediate)$/.test(name.split(' ')[0]) || findSkills(name).length) return m
      swapped.add('company'); return `${pre} {company}`
    })
    const s2 = skillsToPlaceholder(s); if (s2 !== s) swapped.add('skills')
    return s2
  }
  // Never touch the signature (it has the recruiter's own name/company).
  const cut = String(body).search(SIGNOFF)
  let main = cut > 0 ? body.slice(0, cut) : String(body), sig = cut > 0 ? body.slice(cut) : ''
  if (greet) { main = main.replace(new RegExp(`\\b${greet}\\b`, 'g'), '{firstName}'); swapped.add('firstName') }
  return { subject: job(String(subject || '')), body: job(main) + sig, swapped: [...swapped] }
}

/** Split pasted/OCR'd mail text into subject + body ("Subject: ..." line, Outlook headers dropped). */
export function splitMail(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  let subject = ''
  const body = []
  for (const l of lines) {
    const s = l.match(/^\s*subject\s*:\s*(.+)$/i)
    if (s && !subject) { subject = s[1].trim(); continue }
    if (/^\s*(from|to|cc|bcc|sent|date)\s*:/i.test(l) && !body.some((b) => b.trim())) continue // header lines before the body
    body.push(l)
  }
  return { subject, body: body.join('\n').replace(/^\s+|\s+$/g, '') }
}
