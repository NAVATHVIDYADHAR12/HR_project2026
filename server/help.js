import { db } from './db.js'
import { ask, parseQuestion } from './ask.js'

// Help bot: small talk + a built-in guide to every feature + facts the user taught it + live answers from memory.
// Works offline; with AI it phrases answers naturally using only this guide, the notes and the data as context.

export const GUIDE = [
  { page: 'match', k: 'resume matcher match resumes jd upload pdf docx strong moderate weak shortlist score rank screen', a: 'Open Resume Matcher, drop in your resumes (PDF, DOCX or TXT, up to 500) and paste or upload the JD, then click Run match. You get three tables: strong (90%+), moderate (60–89%) and weak, each with name, phone and email. The sliders change the cut-offs, and Export to Excel saves all three.' },
  { page: 'match', k: 'refine ai score reason why rank better', a: 'Turn on "Refine with AI" in Resume Matcher. AI re-scores the top 40 resumes and writes one line explaining each score. The final score is 60% AI and 40% the offline score.' },
  { page: 'extension', k: 'extension chrome naukri linkedin indeed upwork credits download install sourcing search results screen', a: 'Go to Sourcing Extension and click Download extension. Unzip it, open chrome://extensions, turn on Developer mode, click Load unpacked and choose the unzipped folder. Paste your extension key once (it is shown on the same page). Then open any job-board search, enter the job title or JD, skills and experience, and click Start screening.' },
  { page: 'extension', k: 'strict reject requirement missing filter experience skills must have related alias', a: 'Strict screening is on by default in the extension: a profile is rejected if even one requirement is missing or not shown on the card. Every must-have skill and every required JD skill must appear, and common spellings count (k8s = Kubernetes, ReactJS = React). Turn Strict off to only flag unknown values instead.' },
  { page: 'extension', k: 'pick card not found layout site', a: 'If the extension doesn’t find the result cards on a site, click Pick a card in the popup, then click any one candidate on the page. That layout is saved for the site.' },
  { page: 'extension', k: 'extension key paste connect popup', a: 'Your extension key is on the Sourcing Extension page and in Settings. Copy it and paste it once into the extension popup. "New key" in Settings replaces it; the old key then stops working.' },
  { page: 'memory', k: 'candidate memory add update note type speak voice mic screenshot image ocr save status selected rejected hold', a: 'Open Candidate Memory and tell it what happened: type it, tap the mic and speak, or drop or paste a screenshot. Click Read note, check the fields and answer any questions it asks, then Save. It updates existing people instead of making duplicates, and keeps a full history.' },
  { page: 'memory', k: 'pan masked hidden show reveal', a: 'PAN numbers are stored only on this computer and are masked everywhere. Click the eye icon in a candidate’s details to see the full number.' },
  { page: 'memory', k: 'download list excel word pdf candidate memory export', a: 'In Candidate Memory, filter the list (search box and status buttons), then use "Download this list" to get Excel, Word or PDF.' },
  { page: 'ask', k: 'ask memory question how many who why rejected selected hold list filter chips', a: 'Ask Memory answers questions from your saved candidates, for example "how many selected this month", "who was rejected for Infosys and why", or "moderate candidates without already selected and rejected". Click the chips under an answer to change filters.' },
  { page: 'ask', k: 'tracker excel word pdf download format template columns export sheet', a: 'Say "send me the tracker of selected candidates" in Ask Memory (add "in PDF" or "as Word" for those formats), or use the Excel, Word and PDF buttons under any answer. The Tracker format button lets you pick default columns, type your own, or upload your client’s Excel template.' },
  { page: 'mail', k: 'mail drop email template outreach send outlook gmail draft candidates personalise', a: 'Mail Drop: 1) write or import a template with {placeholders}, 2) paste the new JD (AI can rewrite your template for it), 3) pick candidates by name or group, 4) preview every mail, then download Outlook drafts or send.' },
  { page: 'mail', k: 'outlook sign in microsoft connect token access agent send automatically account', a: 'To send from Outlook automatically, open Mail Drop → Send settings → Microsoft (Outlook) and click Sign in with Microsoft. You enter the code shown on Microsoft’s own page, and no password is stored. It needs a one-time free app registration; the step-by-step guide is in that panel. You can also use an app password (Gmail or Outlook), or just Outlook drafts.' },
  { page: 'poster', k: 'poster design hiring image linkedin caption png download reference colours logo', a: 'Poster Studio: paste the JD and click Build poster. Pick one of 4 designs and 3 sizes, upload a reference poster to copy its colours, add your logo, edit any text, then Download PNG. It also writes a LinkedIn caption.' },
  { page: 'linkedin', k: 'linkedin groups post repost weekly limit rank join queue', a: 'LinkedIn Groups ranks your groups for each JD and tracks your weekly limit. For each group: Copy caption & open, post it in LinkedIn, then click I posted it. LinkedIn does not let any app post into groups automatically, so this part is always assisted.' },
  { page: 'linkedin', k: 'linkedin connect token access api automatic post feed profile', a: 'Connect LinkedIn (LinkedIn Groups → Connect LinkedIn) lets TalentDesk post your poster and caption to your own LinkedIn feed with one click, using LinkedIn’s official sign-in. It needs a free LinkedIn developer app; the setup guide is on that page. Group posting stays assisted because LinkedIn doesn’t allow it through its API.' },
  { page: 'settings', k: 'ai key groq nvidia openrouter nemotron settings provider model api', a: 'In Settings, paste a free Groq, NVIDIA or OpenRouter key and click Save & connect. The key is checked first and stored only on this computer. If the main provider fails, the other one takes over automatically.' },
  { page: 'settings', k: 'backup restore data export database copy', a: 'Settings → Your data → Download backup saves everything in one file. To restore, close TalentDesk, rename data/talentdesk.db, put the backup in its place with that name, then start TalentDesk again.' },
  { page: null, k: 'password forgot reset login sign in account', a: 'Forgot your password? In the TalentDesk folder, run: npm run reset-password your@email. It prints a temporary password.' },
  { page: null, k: 'private privacy safe data where stored security network', a: 'Everything stays on this computer in data/talentdesk.db. The app only answers this computer, not the office network, and other websites can’t reach it. Only what you choose goes to your AI provider.' },
  { page: null, k: 'start run open launch install', a: 'Double-click "Start TalentDesk.bat" in the project folder. It opens http://localhost:5174. Keep its window open while you work.' },
  { page: null, k: 'dark mode light theme day night switch', a: 'Use the day/night switch at the bottom of the sidebar, or at the top of the home page.' },
]

const STOP = new Set('a an the is are was were do does did i me my we you your it to of in on for and or how what can could should would will with please pls tell about this that there here which where when'.split(' '))
const words = (s) => String(s).toLowerCase().match(/[a-z0-9+#.]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) || []

const SMALL = [
  [/^(hi|hii+|hello|hey|hola|namaste|good (morning|afternoon|evening)|yo)\b/i, (n) => `Hi${n ? ' ' + n : ''}! I’m the TalentDesk helper. Ask me how to do anything here, or ask about your candidates, like “how many selected this month?”`],
  [/^(thanks|thank you|thx|ty|great|awesome|cool|nice|ok(ay)?|perfect)\b/i, () => 'Happy to help! Anything else?'],
  [/^(bye|goodbye|see you|good night)\b/i, () => 'Bye! Your data is saved. See you soon.'],
  [/\b(who are you|what are you|your name)\b/i, () => 'I’m the TalentDesk helper. I know every feature of this app, I can answer questions about your saved candidates, and I remember anything you tell me with “remember: …”.'],
  [/\bhow are you\b/i, () => 'All good and ready to help you hire! What are you working on?'],
  [/^(help|what can you do|menu|options)\b|\bwhat can (you|i) do\b/i, () => 'I can help you: rank resumes against a JD, screen job-board searches with the extension, save and search candidate updates, export trackers (Excel, Word, PDF), send personal mails, make hiring posters and post to LinkedIn. Ask about any of these, or ask about your candidates.'],
]

export const listNotes = () => db.prepare('SELECT id, text, createdAt FROM help_notes ORDER BY id DESC').all()
export const deleteNote = (id) => db.prepare('DELETE FROM help_notes WHERE id = ?').run(id).changes > 0

// Best guide entries and notes for a question (keyword overlap, longer matches count more).
export function retrieve(q, { notes = true } = {}) {
  const qw = new Set(words(q))
  const score = (text) => words(text).reduce((a, w) => a + (qw.has(w) ? 1 + Math.min(w.length, 8) / 8 : 0), 0)
  const guide = GUIDE.map((g) => ({ ...g, s: score(g.k) + score(g.a) * 0.25 })).filter((g) => g.s > 0).sort((a, b) => b.s - a.s)
  const ns = notes ? listNotes().map((n) => ({ ...n, s: score(n.text) })).filter((n) => n.s >= 1.5).sort((a, b) => b.s - a.s) : []
  return { guide, notes: ns }
}

// Is this about the user's candidates (answerable from memory)?
export function isDataQuestion(q) {
  const f = parseQuestion(q)
  return !!(f.statuses.length || f.names.length || f.companies.length || f.excludeStatuses.length || f.dateFrom || f.locations.length || (f.skills.length && /\b(candidates?|people|who|how many|list|profiles?)\b/i.test(q)))
}

/** Reply to one message. loggedIn=false → guide and small talk only (never any candidate data). */
export async function reply(message, { loggedIn, name = '', chat, aiOn = false } = {}) {
  const q = String(message || '').trim().slice(0, 1000)
  if (!q) return { reply: 'Type a question and I’ll help.' }

  const teach = q.match(/^(?:remember|note|save this|learn)\s*[:\-]\s*(.{3,})$/i)
  if (teach) {
    if (!loggedIn) return { reply: 'Log in first, then I can remember things for you.', links: [{ label: 'Log in', to: '/login' }] }
    db.prepare('INSERT INTO help_notes (text) VALUES (?)').run(teach[1].trim().slice(0, 500))
    return { reply: `Got it, I’ll remember: “${teach[1].trim()}”. Ask me about it any time.` }
  }
  const forget = q.match(/^forget\s*[:\-]?\s*(.+)$/i)
  if (forget && loggedIn) {
    const hit = retrieve(forget[1]).notes[0]
    if (!hit) return { reply: 'I couldn’t find a saved note like that.' }
    deleteNote(hit.id)
    return { reply: `Forgotten: “${hit.text}”.` }
  }

  for (const [re, fn] of SMALL) if (re.test(q) && q.split(/\s+/).length <= 6) return { reply: fn(name.split(' ')[0]), suggestions: ['How do I match resumes?', 'How many selected this month?', 'How do I install the extension?'] }

  const { guide, notes } = retrieve(q, { notes: loggedIn })
  let data = null
  if (loggedIn && isDataQuestion(q)) {
    const r = ask(q)
    data = { text: r.text, rows: (r.rows || []).slice(0, 8).map((x) => [x.name, x.evStatus, x.evCompany, x.evReason].filter(Boolean).join(' · ')), detail: r.detail && r.text }
  }
  const links = []
  if (data) links.push({ label: 'Open in Ask Memory', page: 'ask' })
  if (guide[0]?.page) links.push({ label: `Go to ${PAGE_NAMES[guide[0].page]}`, page: guide[0].page })
  if (!loggedIn) links.push({ label: 'Create free account', to: '/signup' })

  if (aiOn && chat) {
    try {
      const context = [
        guide.slice(0, 4).map((g) => `- ${g.a}`).join('\n'),
        notes.length ? `Facts the recruiter told you:\n${notes.slice(0, 5).map((n) => `- ${n.text}`).join('\n')}` : '',
        data ? `Answer from their candidate memory: ${data.text}\n${data.rows.join('\n')}` : '',
      ].filter(Boolean).join('\n\n')
      const out = await chat([
        { role: 'system', content: `You are the friendly in-app helper of TalentDesk, a recruiting app for Indian IT recruiters. Answer in 1-4 short sentences, plain words, no markdown headings. Use ONLY the context below; if it doesn't cover the question, say so and suggest what they can ask. Never invent candidate data or features.\n\nCONTEXT:\n${context || '(nothing relevant found)'}` },
        { role: 'user', content: q },
      ], { maxTokens: 300, temperature: 0.3 })
      return { reply: out.text, links, ai: true }
    } catch { /* fall through to the offline answer */ }
  }

  const parts = []
  if (data) parts.push(data.text + (data.rows.length ? '\n' + data.rows.map((r) => `• ${r}`).join('\n') : ''))
  if (notes.length) parts.push(`You told me: ${notes.slice(0, 2).map((n) => `“${n.text}”`).join(' and ')}`)
  if (!data && guide.length && guide[0].s >= 1) parts.push(guide[0].a)
  if (!parts.length) return {
    reply: 'I’m not sure about that one. I can explain any feature, answer questions about your candidates, or remember a fact if you write “remember: …”.',
    suggestions: ['How do I match resumes?', 'Who is on hold?', 'How do I send mails from Outlook?'], links,
  }
  return { reply: parts.join('\n\n'), links }
}

export const PAGE_NAMES = { match: 'Resume Matcher', extension: 'Sourcing Extension', memory: 'Candidate Memory', ask: 'Ask Memory', mail: 'Mail Drop', poster: 'Poster Studio', linkedin: 'LinkedIn Groups', settings: 'Settings' }
