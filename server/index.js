import express from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { existsSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractText, extractFields } from './parse.js'
import { parseJD, scoreResume, bucket } from './match.js'
import { saveResume, db } from './db.js'
import * as mail from './mail.js'
import * as poster from './poster.js'
import * as li from './linkedin.js'
import * as auth from './auth.js'
import * as help from './help.js'
import * as outlook from './outlook.js'
import * as liApi from './linkedin-api.js'
import { seedDemo, DEMO, DEMO_LOGIN } from './demo.js'
import { scoreCards } from './card.js'
import { parseNote, toISODate } from './memory.js'
import { ask, parseQuestion, describe } from './ask.js'
import { EXPORT_FIELDS, FIELD_NAMES, DEFAULT_COLUMNS, parseColumnList, readTemplate, getFormat, setFormat, publicFormat, exportWithSavedFormat, exportAs } from './tracker.js'
import { normalizeSkills } from './skills.js'
import { review, save as saveCandidates, list as listCandidates, get as getCandidate, remove as removeCandidate, knownNames, knownCompanies, FIELDS, STATUSES } from './candidates.js'
import { publicConfig, saveConfig, testProvider, chat, aiAvailable, mapLimit, PROVIDERS } from './ai.js'

seedDemo()
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 500 } })
// Only TalentDesk itself (any localhost port) and its Chrome extension may call the API, so a website
// you visit can't send requests to your local candidate data.
const ALLOWED_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|chrome-extension:\/\/[a-p]{32})$/
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin
  // Also allow the site's own address (the hosted demo, e.g. https://talentdesk.vercel.app).
  const sameSite = origin && origin.replace(/^https?:\/\//, '') === req.headers.host
  if (origin && !sameSite && !ALLOWED_ORIGIN.test(origin)) return res.status(403).json({ error: 'Requests from other websites are blocked.' })
  next()
})
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (_, res) => res.json({ ok: true }))

// Accounts. Public: sign up, log in, who-am-I. Everything else needs a session (or the extension key).
app.post('/api/auth/signup', (req, res) => {
  const { user, token } = auth.signup(req.body)
  res.setHeader('Set-Cookie', auth.sessionCookie(token)).status(201).json({ user })
})
app.post('/api/auth/login', (req, res) => {
  const { user, token } = auth.login(req.body)
  res.setHeader('Set-Cookie', auth.sessionCookie(token)).json({ user })
})
app.post('/api/auth/logout', (req, res) => {
  auth.logout(auth.readCookie(req.headers.cookie))
  res.setHeader('Set-Cookie', auth.clearCookie()).json({ ok: true })
})
app.get('/api/auth/me', (req, res) => {
  const user = auth.userForToken(auth.readCookie(req.headers.cookie))
  user ? res.json({ user }) : res.status(401).json({ error: 'Not logged in', hasUsers: auth.hasUsers(), demo: DEMO ? DEMO_LOGIN : null })
})
// LinkedIn OAuth callback: public (LinkedIn redirects here), protected by the one-time state from /start.
const LI_REDIRECT = `http://localhost:${process.env.PORT || 5174}/api/linkedin/oauth/callback`
const safeReturn = (u) => (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u || '') ? u : `http://localhost:${process.env.PORT || 5174}`)
app.get('/api/linkedin/oauth/callback', async (req, res) => {
  try { res.redirect(`${safeReturn(await liApi.liCallback(req.query, LI_REDIRECT))}/app#linkedin`) }
  catch (e) { res.redirect(`${safeReturn(e.returnTo)}/app?li_error=${encodeURIComponent(e.message)}#linkedin`) }
})

// Help bot: open to everyone (home page too), but candidate data, notes and AI only when logged in.
app.post('/api/help', async (req, res) => {
  const user = auth.userForToken(auth.readCookie(req.headers.cookie))
  res.json(await help.reply(req.body.message, { loggedIn: !!user, name: user?.name || '', chat, aiOn: !!user && aiAvailable() && req.body.ai !== false }))
})
app.use('/api', (req, res, next) => {
  req.user = auth.userForToken(auth.readCookie(req.headers.cookie))
  if (req.user || auth.validExtensionKey(req.headers['x-td-key'])) return next()
  res.status(401).json({ error: 'Please log in.' })
})
app.get('/api/help/notes', (_, res) => res.json({ notes: help.listNotes() }))
app.delete('/api/help/notes/:id', (req, res) => res.json({ deleted: help.deleteNote(Number(req.params.id)) }))
app.get('/api/auth/extension-key', (_, res) => res.json({ key: auth.extensionKey() }))
app.post('/api/auth/extension-key', (_, res) => res.json({ key: auth.rotateExtensionKey() }))

// F1: resumes + JD -> scored, bucketed list. Each file is parsed on its own so one bad file can't fail the batch.
app.post('/api/match', upload.fields([{ name: 'resumes' }, { name: 'jdFile', maxCount: 1 }]), async (req, res) => {
  let jdText = (req.body.jd || '').trim()
  if (req.files?.jdFile?.[0]) {
    const f = req.files.jdFile[0]
    try { jdText = `${jdText}\n${await extractText(f.buffer, f.originalname)}`.trim() }
    catch (e) { return res.status(400).json({ error: `JD file: ${e.message}` }) }
  }
  if (!jdText) return res.status(400).json({ error: 'Add a job description first.' })
  const files = req.files?.resumes || []
  if (!files.length) return res.status(400).json({ error: 'Upload at least one resume.' })

  const strong = Number(req.body.strong) || 90
  const moderate = Number(req.body.moderate) || 60
  const jd = parseJD(jdText)
  const results = [], failed = [], textOf = new WeakMap()
  for (const f of files) {
    const filename = Buffer.from(f.originalname, 'latin1').toString('utf8') // multer gives latin1-decoded names
    try {
      const text = await extractText(f.buffer, filename)
      if (text.trim().length < 30) throw new Error('No readable text (scanned image PDF?)')
      const fields = extractFields(text)
      const id = saveResume({ ...fields, filename, text })
      const s = scoreResume({ ...fields, text }, jd)
      const row = { id, filename, ...fields, ...s, bucket: bucket(s.score, strong, moderate) }
      textOf.set(row, text)
      results.push(row)
    } catch (e) {
      failed.push({ filename, error: e.message })
    }
  }
  results.sort((a, b) => b.score - a.score)

  let ai = { used: false }
  if (req.body.useAI === 'true') {
    if (!aiAvailable()) ai = { used: false, error: 'No AI key set up. Add one in AI Settings. Showing offline scores.' }
    else {
      const top = results.slice(0, 40) // shortcut: AI re-ranks the top 40 only, to stay inside free-tier rate limits
      let failedCalls = 0, lastError = '', provider = ''
      await mapLimit(top, 3, async (r) => {
        try {
          const out = await aiScore(jdText, textOf.get(r))
          provider = out.provider
          r.offlineScore = r.score
          r.aiScore = out.score
          r.aiReason = out.reason
          r.score = Math.round(0.4 * r.score + 0.6 * out.score)
          if (!r.name && out.name) r.name = out.name
        } catch (e) { failedCalls++; lastError = e.message }
      })
      for (const r of results) r.bucket = bucket(r.score, strong, moderate)
      results.sort((a, b) => b.score - a.score)
      ai = { used: failedCalls < top.length, provider, scored: top.length - failedCalls,
        error: failedCalls ? `AI could not score ${failedCalls} of ${top.length} resumes (${lastError}). Those keep their offline score.` : '' }
    }
  }
  res.json({ ai, jd: { skills: jd.skills, niceToHave: jd.niceToHave, minYears: jd.minYears, maxYears: jd.maxYears }, results, failed })
})

async function aiScore(jd, resume) {
  const out = await chat([
    { role: 'system', content: 'You are a senior IT technical recruiter. Judge how well a resume fits a job description. Focus on must-have skills, years of experience, role level and domain. Be strict: 90+ only if nearly every must-have is clearly present. Reply with JSON only: {"score": <0-100 integer>, "reason": "<one short sentence, max 20 words>", "name": "<candidate full name or empty>"}' },
    { role: 'user', content: `JOB DESCRIPTION:\n${jd.slice(0, 3000)}\n\nRESUME:\n${resume.slice(0, 5000)}` },
  ], { json: true, maxTokens: 200 })
  const score = Math.max(0, Math.min(100, Math.round(Number(out.json.score))))
  if (!Number.isFinite(score)) throw new Error('AI returned no score')
  return { score, reason: String(out.json.reason || '').slice(0, 200), name: String(out.json.name || ''), provider: out.provider }
}

// F2: the Chrome extension itself, zipped from extension/ so it's always the current version.
app.get('/api/extension/download', async (_, res) => {
  const dir = join(process.cwd(), 'extension')
  const zip = new JSZip()
  for (const f of readdirSync(dir)) zip.file(`talentdesk-extension/${f}`, readFileSync(join(dir, f)))
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="talentdesk-extension.zip"')
  res.end(await zip.generateAsync({ type: 'nodebuffer' }))
})

// F2: score job-board search cards sent by the browser extension popup.
app.post('/api/extension/score', (req, res) => {
  const { cards, jd = '', filters = {} } = req.body
  if (!Array.isArray(cards) || !cards.length) return res.status(400).json({ error: 'No candidate cards found on this page.' })
  if (!String(jd).trim() && !(filters.mustSkills || []).length) return res.status(400).json({ error: 'Add a JD or at least one must-have skill.' })
  const safe = cards.slice(0, 500).map((c) => ({ name: String(c.name || '').slice(0, 120), text: String(c.text || '').slice(0, 6000) }))
  res.json({ results: scoreCards(safe, String(jd).slice(0, 20000), filters) })
})

// F6: candidate memory. Parse a note -> review (questions) -> save.
app.post('/api/memory/parse', async (req, res) => {
  const text = String(req.body.text || '').slice(0, 20000)
  if (!text.trim()) return res.status(400).json({ error: 'Type, speak or upload something first.' })
  const opts = { knownNames: knownNames(), knownCompanies: knownCompanies() }
  let parsed = parseNote(text, opts)
  let ai = { used: false }
  if (req.body.useAI && aiAvailable()) {
    try {
      parsed = mergeAI(await aiParse(text, opts.knownNames), parsed)
      ai = { used: true }
    } catch (e) { ai = { used: false, error: `AI could not read the note (${e.message}). Used offline reading instead.` } }
  }
  res.json({ ai, items: review(parsed) })
})
app.post('/api/memory/save', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'Nothing to save.' })
  res.json({ ids: saveCandidates(items, String(req.body.note || ''), String(req.body.source || 'text')) })
})
app.get('/api/candidates', (req, res) => res.json({ candidates: listCandidates({ status: req.query.status, q: req.query.q }) }))
app.get('/api/candidates/:id', (req, res) => {
  const c = getCandidate(Number(req.params.id), { revealPan: req.query.reveal === '1' })
  c ? res.json(c) : res.status(404).json({ error: 'Not found' })
})
app.patch('/api/candidates/:id', (req, res) => {
  saveCandidates([{ fields: req.body.fields || {}, matchId: Number(req.params.id) }], '', 'edit')
  res.json(getCandidate(Number(req.params.id)))
})
app.delete('/api/candidates/:id', (req, res) => res.json({ deleted: removeCandidate(Number(req.params.id)) }))

// F4: LinkedIn groups (assisted). The app ranks and tracks; the user posts on LinkedIn.
app.get('/api/linkedin/groups', (_, res) => res.json({ groups: li.listGroups(), usage: li.usage() }))
app.post('/api/linkedin/import', (req, res) => {
  // From the app (pasted lines) or the extension (scraped list from a LinkedIn page).
  const items = Array.isArray(req.body.groups) ? req.body.groups.slice(0, 500) : li.parseGroupLines(req.body.text)
  if (!items.length) return res.status(400).json({ error: 'No groups found. One per line: Name | link | members | topics' })
  res.json({ ...li.upsertGroups(items), groups: li.listGroups() })
})
app.patch('/api/linkedin/groups/:id', (req, res) => {
  const g = li.updateGroup(Number(req.params.id), req.body)
  g ? res.json({ group: g }) : res.status(404).json({ error: 'Not found' })
})
app.delete('/api/linkedin/groups/:id', (req, res) => res.json({ deleted: li.deleteGroup(Number(req.params.id)) }))
app.post('/api/linkedin/rank', (req, res) => {
  const jd = String(req.body.jd || '').slice(0, 20000)
  if (!jd.trim()) return res.status(400).json({ error: 'Paste the JD or role first.' })
  res.json({ ...li.rank(jd, Math.max(1, Math.min(100, Number(req.body.count) || 10))), usage: li.usage() })
})
app.post('/api/linkedin/posted', (req, res) => res.json({ usage: li.markPosted(Number(req.body.groupId), String(req.body.role || '')) }))
app.post('/api/linkedin/undo', (req, res) => res.json({ usage: li.undoPosted(Number(req.body.groupId)) }))
app.post('/api/linkedin/limit', (req, res) => res.json({ usage: li.setLimit(req.body.limit) }))

// LinkedIn API: connect (OAuth) and post to the member's own feed.
app.get('/api/linkedin/api', (_, res) => res.json(liApi.liStatus(LI_REDIRECT)))
app.post('/api/linkedin/api/config', (req, res) => { liApi.liConfig(req.body); res.json(liApi.liStatus(LI_REDIRECT)) })
app.post('/api/linkedin/api/start', (req, res) => res.json({ url: liApi.liAuthUrl(LI_REDIRECT, safeReturn(req.body.returnTo)) }))
app.post('/api/linkedin/api/disconnect', (_, res) => { liApi.liDisconnect(); res.json(liApi.liStatus(LI_REDIRECT)) })
app.post('/api/linkedin/api/post', async (req, res) => {
  if (req.body.confirm !== true) return res.status(400).json({ error: 'Posting needs your confirmation.' })
  res.json(await liApi.liPost(String(req.body.text || '').slice(0, 3000), req.body.image || null))
})

// F3: poster copy. Details from the JD + offline words, improved by AI when asked.
app.post('/api/poster/copy', async (req, res) => {
  const jd = String(req.body.jd || '').slice(0, 20000)
  const contact = String(req.body.contact || '').slice(0, 200)
  if (!jd.trim()) return res.status(400).json({ error: 'Paste the JD first.' })
  const details = { ...poster.jdDetails(jd), ...Object.fromEntries(Object.entries(req.body.details || {}).map(([k, v]) => [k, String(v || '').slice(0, 200)]).filter(([, v]) => v)) }
  const base = poster.offlineCopy(jd, details, contact)
  if (!req.body.useAI || !aiAvailable()) return res.json({ details, copy: base, ai: { used: false } })
  try { res.json({ details, copy: { ...base, ...(await poster.aiCopy(chat, jd, details, contact)) }, ai: { used: true } }) }
  catch (e) { res.json({ details, copy: base, ai: { used: false, error: `AI copy failed (${e.message}); using the standard wording.` } }) }
})

// F10: mail drop.
app.get('/api/mail/templates', (_, res) => res.json({ templates: mail.listTemplates(), placeholders: mail.PLACEHOLDERS }))
app.post('/api/mail/templates', (req, res) => res.json({ id: mail.saveTemplate(req.body), templates: mail.listTemplates() }))
app.delete('/api/mail/templates/:id', (req, res) => res.json({ deleted: mail.deleteTemplate(Number(req.params.id)), templates: mail.listTemplates() }))
app.post('/api/mail/split', (req, res) => res.json(mail.splitMail(String(req.body.text || '').slice(0, 20000))))
app.post('/api/mail/jd', (req, res) => res.json({ details: mail.jdDetails(String(req.body.jd || '').slice(0, 20000)) }))
app.post('/api/mail/rewrite', async (req, res) => {
  const subject = String(req.body.subject || ''), body = String(req.body.body || ''), jd = String(req.body.jd || '').slice(0, 8000)
  if (!body.trim()) return res.status(400).json({ error: 'Pick or write a template first.' })
  if (!jd.trim()) return res.status(400).json({ error: 'Paste the new JD first.' })
  // No AI (or AI fails): swap the old job's details for {placeholders} offline; the new JD fills them at preview.
  const offline = (note) => res.json({ ...mail.templatize(subject, body), provider: 'offline', note })
  if (!aiAvailable() || req.body.offline) return offline()
  try {
    const out = await chat([
      { role: 'system', content: `You rewrite an Indian IT recruiter's outreach email template for a new job opening.
Keep the SAME tone, length, structure, greeting style and signature as the original. Replace the old job's details with the new job's.
Use these placeholders exactly (with braces) instead of real values: {firstName} for the candidate's first name, {role}, {company}, {skills}, {experience}, {location}, {notice}, {salary}. Use a placeholder only if the new JD has that information, except {firstName}.
Never invent facts (salary, benefits, client names) that are not in the JD. Keep any contact details/signature from the original unchanged.
Reply with JSON only: {"subject": "...", "body": "..."}` },
      { role: 'user', content: `ORIGINAL TEMPLATE\nSubject: ${subject}\n\n${body.slice(0, 6000)}\n\nNEW JOB DESCRIPTION\n${jd}` },
    ], { json: true, maxTokens: 1500, temperature: 0.4 })
    const s = String(out.json.subject || subject).trim(), b = String(out.json.body || '').trim()
    if (b.length < 20) throw new Error('AI returned an empty mail')
    // Safety net: if the AI kept the old candidate's name, make it a placeholder anyway.
    const kept = !/\{firstName\}/.test(b) && mail.greetName(b)
    res.json({ subject: s, body: kept ? b.replace(new RegExp(`\\b${kept}\\b`, 'g'), '{firstName}') : b, provider: out.provider })
  } catch (e) { offline(`AI rewrite failed (${e.message}), so placeholders were filled in offline instead.`) }
})
app.post('/api/mail/recipients', (req, res) => {
  if (req.body.q) {
    // "selected for Infosys this month" -> the same people Ask Memory would list.
    const r = ask(String(req.body.q).slice(0, 500), { filters: { ...parseQuestion(String(req.body.q)), limit: 500 } })
    const rows = r.detail ? [r.detail] : r.rows
    const resumeEmail = db.prepare("SELECT email FROM resumes WHERE lower(name) = lower(?) AND email <> ''")
    return res.json({ summary: r.text, recipients: rows.map((c) => {
      const fromResume = !c.email && resumeEmail.all(c.name).length === 1
      const email = c.email || (fromResume ? resumeEmail.get(c.name).email : '')
      return { input: c.name, status: email ? 'ok' : 'noemail', name: c.name, email, candidateId: c.id, source: fromResume ? 'resume' : 'memory' }
    }) })
  }
  res.json({ recipients: mail.resolveRecipients(req.body.text) })
})
const cleanMessages = (list) => (Array.isArray(list) ? list : []).slice(0, 300).map((m) => ({
  candidateId: Number.isInteger(m.candidateId) ? m.candidateId : null, name: String(m.name || '').slice(0, 120),
  email: String(m.email || '').trim().slice(0, 200), subject: String(m.subject || '').slice(0, 300), body: String(m.body || '').slice(0, 20000),
}))
app.post('/api/mail/preview', (req, res) => {
  const tpl = { subject: String(req.body.subject || ''), body: String(req.body.body || '') }
  const details = Object.fromEntries(mail.PLACEHOLDERS.map((k) => [k, String(req.body.details?.[k] || '').slice(0, 500)]))
  res.json({ messages: cleanMessages(req.body.recipients).map((p) => ({ ...p, ...mail.render(tpl, details, p) })) })
})
app.get('/api/mail/smtp', (_, res) => res.json({ smtp: mail.publicSmtp(), presets: mail.SMTP_PRESETS }))
app.post('/api/mail/smtp', (req, res) => res.json({ smtp: mail.saveSmtp(req.body) }))
app.post('/api/mail/smtp/test', async (_, res) => {
  try { await mail.transport().verify(); res.json({ ok: true }) }
  catch (e) { res.status(e.status || 400).json({ error: e.status ? e.message : mail.friendlySmtpError(e) }) }
})
app.post('/api/mail/send', async (req, res) => {
  // The UI shows a confirm step listing every recipient; without it nothing is sent.
  if (req.body.confirm !== true) return res.status(400).json({ error: 'Sending needs your confirmation.' })
  const messages = cleanMessages(req.body.messages)
  if (!messages.length) return res.status(400).json({ error: 'No mails to send.' })
  try { res.json({ results: await mail.sendAll(messages, { role: String(req.body.role || '').slice(0, 100) }) }) }
  catch (e) { res.status(e.status || 500).json({ error: e.message }) }
})
app.post('/api/mail/drafts', async (req, res) => {
  const messages = cleanMessages(req.body.messages).filter((m) => m.email)
  if (!messages.length) return res.status(400).json({ error: 'No mails with an email address.' })
  const role = String(req.body.role || '').slice(0, 100)
  const buf = await mail.draftsZip(messages, role)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="outlook-drafts-${new Date().toISOString().slice(0, 10)}.zip"`)
  res.end(buf)
})
// Outlook (Microsoft Graph) sign-in with a device code; tokens only, no password.
app.get('/api/mail/outlook', (_, res) => res.json({ ...outlook.msStatus(), method: outlook.mailMethod() }))
app.post('/api/mail/outlook/start', async (req, res) => res.json(await outlook.msStart(req.body.clientId, req.body.tenant)))
app.post('/api/mail/outlook/poll', async (_, res) => res.json(await outlook.msPoll()))
app.post('/api/mail/outlook/disconnect', (_, res) => res.json(outlook.msDisconnect()))
app.post('/api/mail/method', (req, res) => { outlook.setMailMethod(req.body.method); res.json({ method: outlook.mailMethod() }) })
app.post('/api/mail/outlook/drafts', async (req, res) => {
  const messages = cleanMessages(req.body.messages).filter((m) => m.email)
  if (!messages.length) return res.status(400).json({ error: 'No mails with an email address.' })
  const results = await outlook.msDrafts(messages)
  for (const r of results) mail.logMail(r, 'outlook-draft', r.ok ? 'drafted' : 'failed', r.ok ? null : r.error, String(req.body.role || '').slice(0, 100))
  res.json({ results })
})
app.get('/api/mail/log', (_, res) => res.json({ log: mail.mailLog() }))

// F8: Excel tracker. Format = default columns, typed columns, or the user's own template file.
const cleanColumns = (cols) => (Array.isArray(cols) ? cols : []).slice(0, 60)
  .map((c) => ({ header: String(c.header || '').slice(0, 100).trim(), field: EXPORT_FIELDS[c.field] ? c.field : null, ...(Number.isInteger(c.col) ? { col: c.col } : {}) }))
  .filter((c) => c.header)
const fieldOptions = () => Object.entries(FIELD_NAMES).map(([field, label]) => ({ field, label }))
app.get('/api/tracker/format', (_, res) => res.json({ format: publicFormat(), fields: fieldOptions() }))
app.post('/api/tracker/columns', (req, res) => res.json({ columns: parseColumnList(String(req.body.text || '')) }))
app.post('/api/tracker/format', (req, res) => {
  const { type } = req.body
  if (type === 'default') return res.json({ format: setFormat({ type: 'default', columns: DEFAULT_COLUMNS }) })
  const columns = cleanColumns(req.body.columns)
  if (!columns.length) return res.status(400).json({ error: 'Add at least one column.' })
  if (type === 'columns') return res.json({ format: setFormat({ type: 'columns', columns }) })
  if (type === 'template') {
    const cur = getFormat()
    if (cur.type !== 'template') return res.status(400).json({ error: 'Upload a template first.' })
    // Only the field mapping can change; columns stay where the template has them.
    const byCol = new Map(columns.map((c) => [c.col, c.field]))
    return res.json({ format: setFormat({ ...cur, columns: cur.columns.map((c) => ({ ...c, field: byCol.has(c.col) ? byCol.get(c.col) : c.field })) }) })
  }
  res.status(400).json({ error: 'Unknown format type' })
})
app.post('/api/tracker/template', multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an .xlsx file.' })
  if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Templates must be .xlsx (in Excel: File → Save As → Excel Workbook).' })
  try {
    const info = await readTemplate(req.file.buffer)
    res.json({ format: setFormat({ type: 'template', template: req.file.buffer.toString('base64'), templateName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), ...info }) })
  } catch (e) { res.status(400).json({ error: `Could not read the template: ${e.message}` }) }
})
// Send rows as .xlsx (saved tracker format), .docx or .pdf.
async function sendExport(res, rows, title, kind) {
  kind = ['xlsx', 'docx', 'pdf'].includes(kind) ? kind : 'xlsx'
  const { buf, mime } = await exportAs(rows, title, kind)
  const name = `tracker-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'all'}-${new Date().toISOString().slice(0, 10)}.${kind}`
  res.setHeader('Content-Type', mime)
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.setHeader('X-Row-Count', String(rows.length))
  res.end(buf)
}
app.post('/api/tracker/export', async (req, res) => {
  const q = String(req.body.q || '').slice(0, 500)
  const filters = req.body.filters ? cleanFilters(req.body.filters, parseQuestion(q)) : parseQuestion(q)
  const result = ask(q, { filters: { ...filters, limit: 5000 } })
  const rows = result.detail ? [result.detail] : result.rows
  await sendExport(res, rows, describe(filters).replace(/[^\w &.-]+/g, ' ').trim().slice(0, 60) || 'Tracker', req.body.format)
})
// Candidate Memory list (search box + status filter) exactly as shown.
app.post('/api/tracker/export-list', async (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : undefined
  const q = String(req.body.q || '').slice(0, 200)
  const rows = listCandidates({ status, q, limit: 5000 })
  await sendExport(res, rows, [status ? status[0].toUpperCase() + status.slice(1) : 'All candidates', q && `matching ${q}`].filter(Boolean).join(' '), req.body.format)
})

// F7: Ask Memory. Offline parse by default; AI only translates the question into the same filters.
app.post('/api/ask', async (req, res) => {
  const q = String(req.body.q || '').slice(0, 500)
  if (req.body.filters) return res.json({ ai: { used: false }, ...ask(q, { filters: cleanFilters(req.body.filters, parseQuestion(q)) }) })
  if (!q.trim()) return res.status(400).json({ error: 'Ask a question first.' })
  let ai = { used: false }
  let filters = parseQuestion(q)
  if (req.body.useAI && aiAvailable()) {
    try { filters = cleanFilters(await aiFilters(q), filters); ai = { used: true } }
    catch (e) { ai = { used: false, error: `AI could not read the question (${e.message}). Answered offline.` } }
  }
  res.json({ ai, ...ask(q, { filters }) })
})

async function aiFilters(q) {
  const today = new Date().toISOString().slice(0, 10)
  const out = await chat([
    { role: 'system', content: `Convert an Indian IT recruiter's question about their candidate tracker into search filters. Today is ${today}. Reply with JSON only:
{"intent":"count|list|why|recent|detail","statuses":[],"excludeStatuses":[],"companies":[],"excludeCompanies":[],"skills":[],"names":[],"locations":[],"dateFrom":"YYYY-MM-DD or null","dateTo":"YYYY-MM-DD or null","maxNotice":null,"maxEctc":null,"limit":null}
statuses/excludeStatuses use only: ${STATUSES.join(', ')} (shortlisted/interview = "in process"; joined/offered/placed = "selected").
companies = client companies named. names = candidate names exactly as written. maxNotice in days (immediate joiner = 15). maxEctc in lakhs.
"remove/without/except already selected" -> excludeStatuses. "till now"/"so far" = no dates. "why" questions -> intent "why".` },
    { role: 'user', content: q },
  ], { json: true, maxTokens: 400 })
  return out.json
}

// Accept only known keys/values from AI or the UI; map names/companies onto what's really in memory.
function cleanFilters(raw, base) {
  const arr = (v, ok = () => true) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x && ok(x)) : [])
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined)
  const num = (v) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v))
  const st = (s) => STATUSES.includes(s.toLowerCase())
  const names = knownNames(), companies = knownCompanies()
  const snap = (v, list) => list.find((x) => x.toLowerCase() === v.toLowerCase()) || list.find((x) => x.toLowerCase().startsWith(v.toLowerCase() + ' ')) || v
  const f = {
    intent: ['count', 'list', 'why', 'recent', 'detail'].includes(raw.intent) ? raw.intent : base.intent,
    statuses: arr(raw.statuses, st).map((s) => s.toLowerCase()),
    excludeStatuses: arr(raw.excludeStatuses, st).map((s) => s.toLowerCase()),
    companies: arr(raw.companies).map((c) => snap(c, companies)),
    excludeCompanies: arr(raw.excludeCompanies).map((c) => snap(c, companies)),
    skills: normalizeSkills(arr(raw.skills)),
    names: arr(raw.names).map((n) => snap(n, names)),
    locations: arr(raw.locations),
    dateFrom: date(raw.dateFrom), dateTo: date(raw.dateTo) || (date(raw.dateFrom) && new Date().toISOString().slice(0, 10)),
    maxNotice: num(raw.maxNotice), maxEctc: num(raw.maxEctc),
    limit: Math.min(num(raw.limit) || base.limit || 500, 500),
    text: typeof raw.text === 'string' ? raw.text : base.text,
    export: base.export,
    exportFormat: base.exportFormat,
  }
  if (f.dateFrom) f.dateLabel = raw.dateLabel || `${f.dateFrom} to ${f.dateTo}`
  return f
}

const AI_FIELDS ='name, email, phone, status, reason, company, role, notice, ctc, ectc, currentCompany, previousCompany, leavingReason, leavingDate, location, jobLocation, qualification, dob, pan, skills, date'
async function aiParse(text, names) {
  const today = new Date().toISOString().slice(0, 10)
  const out = await chat([
    { role: 'system', content: `You extract candidate updates from an Indian IT recruiter's notes (typed, dictated by voice, or OCR from screenshots, so expect typos and missing punctuation). Today is ${today}.
Return JSON only: {"candidates":[{...}]} with one object per person mentioned. Allowed keys: ${AI_FIELDS}, unclear.
Rules:
- status must be one of: ${STATUSES.join(', ')} (shortlisted/interview scheduled = "in process"; "keep for later" = "hold"). Omit if not stated.
- company = the client company the candidate was selected/rejected/held FOR. currentCompany/previousCompany = where the candidate works/worked. A company the candidate "left"/"resigned from"/"ex-" is previousCompany.
- Expand Indian shorthand: np = notice period, ctc/ectc, hyd = Hyderabad, blr/bglr = Bangalore, chn = Chennai, coz = because.
- reason = why selected/rejected/on hold. leavingReason = why they left their previous job.
- ctc/ectc: keep as written with unit, e.g. "12 LPA". notice: e.g. "30 days" or "Immediate".
- dates as YYYY-MM-DD (or YYYY-MM if no day). date = when this status happened (default today).
- location = where the candidate lives; jobLocation = where the job is.
- Fix obvious spelling of names using this list of known candidates when it clearly matches: ${names.slice(0, 300).join(', ') || 'none'}.
- Never invent values. Omit keys you can't find.
- unclear: array of short questions for anything ambiguous (e.g. "Is 'Rahul' Rahul Sharma or Rahul Verma?").` },
    { role: 'user', content: text },
  ], { json: true, maxTokens: 2000 })
  const list = Array.isArray(out.json) ? out.json : out.json.candidates
  if (!Array.isArray(list)) throw new Error('unexpected format')
  return list
}

// AI is the base (better at who-is-who); exact patterns (email/phone/PAN) and anything AI missed come from the offline parser.
function mergeAI(aiList, offline) {
  const used = new Set()
  return aiList.map((a) => {
    const o = offline.find((p, i) => !used.has(i) && p.fields.name && a.name && p.fields.name.toLowerCase() === String(a.name).toLowerCase())
    if (o) used.add(offline.indexOf(o))
    const f = {}
    for (const k of AI_FIELDS.split(', ')) if (a[k] != null && String(a[k]).trim()) f[k] = String(a[k]).trim()
    const ambiguous = {}
    if (f.status) { f.status = f.status.toLowerCase(); if (!STATUSES.includes(f.status)) { ambiguous.statusText = f.status; delete f.status } }
    for (const k of ['email', 'phone', 'pan']) if (o?.fields[k]) f[k] = o.fields[k]
    for (const [k, v] of Object.entries(o?.fields || {})) if (f[k] == null && FIELDS.includes(k)) f[k] = v
    f.date = toISODate(f.date || 'today') || new Date().toISOString().slice(0, 10)
    if (f.dob) f.dob = toISODate(f.dob) || f.dob
    const unclear = Array.isArray(a.unclear) ? a.unclear.filter((q) => typeof q === 'string' && q.trim()).slice(0, 5) : []
    return { block: o?.block || '', fields: f, ambiguous, unclear }
  })
}

// F5: AI provider settings. Keys stay on this machine and are never sent back to the browser.
app.get('/api/ai/config', (_, res) => res.json(publicConfig()))
app.post('/api/ai/config', (req, res) => {
  const { provider, primary } = req.body
  if (provider && !PROVIDERS[provider]) return res.status(400).json({ error: 'Unknown provider' })
  if (primary && !PROVIDERS[primary]) return res.status(400).json({ error: 'Unknown provider' })
  res.json(saveConfig(req.body))
})
app.post('/api/ai/test', async (req, res) => {
  const { provider, key } = req.body
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Unknown provider' })
  try { res.json(await testProvider(provider, key)) }
  catch (e) { res.status(400).json({ ok: false, error: e.message }) }
})
app.post('/api/ai/chat', async (req, res) => {
  const prompt = String(req.body.prompt || '').slice(0, 4000)
  if (!prompt) return res.status(400).json({ error: 'Empty prompt' })
  try { const out = await chat([{ role: 'user', content: prompt }], { maxTokens: 300 }); res.json({ text: out.text, provider: out.provider, model: out.model }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// Export match results as one workbook, one sheet per bucket.
app.post('/api/export/match', async (req, res) => {
  const rows = req.body.results || []
  const wb = new ExcelJS.Workbook()
  for (const [key, title] of [['strong', 'Strong Match'], ['moderate', 'Moderate Match'], ['weak', 'Weak Match']]) {
    const ws = wb.addWorksheet(title)
    ws.columns = [
      { header: 'Name', key: 'name', width: 26 }, { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 32 }, { header: 'Match %', key: 'score', width: 10 },
      { header: 'Experience (yrs)', key: 'years', width: 16 }, { header: 'Matched skills', key: 'matched', width: 40 },
      { header: 'Missing skills', key: 'missing', width: 40 }, { header: 'File', key: 'filename', width: 30 },
    ]
    rows.filter((r) => r.bucket === key).forEach((r) => ws.addRow({ ...r, matched: r.matched.join(', '), missing: r.missing.join(', ') }))
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="resume-matches.xlsx"')
  await wb.xlsx.write(res)
  res.end()
})

// Backup: a consistent copy of the whole memory (candidates, history, resumes, groups, templates, settings incl. keys).
app.get('/api/backup', (_, res) => {
  const file = join(tmpdir(), `talentdesk-backup-${process.pid}-${Date.now()}.db`)
  try {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    res.download(file, `talentdesk-backup-${new Date().toISOString().slice(0, 10)}.db`, () => rmSync(file, { force: true }))
  } catch (e) { rmSync(file, { force: true }); res.status(500).json({ error: `Backup failed: ${e.message}` }) }
})

app.use('/api', (req, res) => res.status(404).json({ error: `Unknown API route ${req.method} ${req.path}` }))
app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err)
  res.status(err.status || 500).json({ error: err.message })
})

export default app

// Run directly (node server/index.js) = API only, for tests and the old launcher. Next.js imports `app` instead (pages/api).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // This computer only: candidate data (incl. PAN) must not be reachable from the office network.
  const PORT = process.env.PORT || 5174
  const HOST = process.env.HOST || '127.0.0.1'
  app.listen(PORT, HOST, () => console.log(`TalentDesk API on http://localhost:${PORT}`))
}
