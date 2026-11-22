import { db } from './db.js'
import { parseJD } from './match.js'
import { findSkills } from './skills.js'

// F4: LinkedIn groups. The app ranks and queues; the user presses Post on LinkedIn themselves
// (automated posting/joining breaks LinkedIn's terms and gets accounts restricted).

export const STATUSES = ['joined', 'pending', 'not joined']

/** "12K members", "1.2M", "1,234" -> number */
export function parseMembers(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km](?![a-z]))?/i) // "m" of "members" is not million
  if (!m) return 0
  return Math.round(parseFloat(m[1]) * (/k/i.test(m[2] || '') ? 1e3 : /m/i.test(m[2] || '') ? 1e6 : 1))
}

/** Clean a LinkedIn group URL to https://www.linkedin.com/groups/<id>/ (also accepts a bare id). */
export function groupUrl(u) {
  const s = String(u || '').trim()
  const id = s.match(/linkedin\.com\/groups\/(\d+)/i)?.[1] || s.match(/^(\d{4,})$/)?.[1]
  return id ? `https://www.linkedin.com/groups/${id}/` : ''
}

/** Bulk paste: one group per line, "Name | url | members | topics" (any order after the name; tabs or | or ,). */
export function parseGroupLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((line) => {
    const parts = line.split(/\s*[|\t]\s*/)
    const url = groupUrl(parts.find((p) => /linkedin\.com\/groups\/\d+/i.test(p)) || '')
    const membersPart = parts.find((p) => /^\s*[\d.,]+\s*[km]?\s*(members?)?\s*$/i.test(p))
    const rest = parts.filter((p) => p !== membersPart && !/linkedin\.com/i.test(p))
    return { name: (rest[0] || '').slice(0, 200), url, members: parseMembers(membersPart), topics: rest.slice(1).join(', ').slice(0, 300) }
  }).filter((g) => g.name)
}

export function upsertGroups(items) {
  let added = 0, updated = 0
  const byUrl = db.prepare('SELECT id FROM linkedin_groups WHERE url = ?')
  const byName = db.prepare('SELECT id FROM linkedin_groups WHERE lower(name) = lower(?) AND (url IS NULL OR url = \'\')')
  for (const g of items) {
    const name = String(g.name || '').trim().slice(0, 200)
    if (!name) continue
    const url = groupUrl(g.url) || null
    const members = Number.isFinite(+g.members) ? Math.max(0, Math.round(+g.members)) : parseMembers(g.members)
    const status = STATUSES.includes(g.status) ? g.status : null
    const existing = (url && byUrl.get(url)) || byName.get(name)
    if (existing) {
      // Keep what the user already set; only refresh name/members/url, fill empty topics,
      // and only ever upgrade status to "joined" (a search-page import must not un-join a group).
      db.prepare(`UPDATE linkedin_groups SET name = ?, url = coalesce(?, url), members = CASE WHEN ? > 0 THEN ? ELSE members END,
        topics = CASE WHEN topics = '' THEN ? ELSE topics END, status = CASE WHEN ? = 'joined' THEN 'joined' ELSE status END WHERE id = ?`)
        .run(name, url, members, members, String(g.topics || ''), status, existing.id)
      updated++
    } else {
      db.prepare('INSERT INTO linkedin_groups (name, url, members, topics, status) VALUES (?, ?, ?, ?, ?)')
        .run(name, url, members, String(g.topics || '').slice(0, 300), status || 'joined')
      added++
    }
  }
  return { added, updated }
}

export const listGroups = () => db.prepare('SELECT * FROM linkedin_groups ORDER BY members DESC, name').all()
export function updateGroup(id, p) {
  const sets = [], args = []
  if (p.name !== undefined) { sets.push('name = ?'); args.push(String(p.name).trim().slice(0, 200)) }
  if (p.topics !== undefined) { sets.push('topics = ?'); args.push(String(p.topics).slice(0, 300)) }
  if (p.members !== undefined) { sets.push('members = ?'); args.push(parseMembers(p.members)) }
  if (p.status !== undefined && STATUSES.includes(p.status)) { sets.push('status = ?'); args.push(p.status) }
  if (p.url !== undefined) { sets.push('url = ?'); args.push(groupUrl(p.url) || null) }
  if (sets.length) db.prepare(`UPDATE linkedin_groups SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
  return db.prepare('SELECT * FROM linkedin_groups WHERE id = ?').get(id)
}
export const deleteGroup = (id) => {
  db.prepare('DELETE FROM linkedin_posts WHERE groupId = ?').run(id)
  return db.prepare('DELETE FROM linkedin_groups WHERE id = ?').run(id).changes > 0
}

// ---- Weekly limit (the user sets their own number; LinkedIn does not publish a fixed one)
const getSetting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
export function weekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // Monday
  return d.toISOString().slice(0, 10)
}
export function usage(now = new Date()) {
  const start = weekStart(now)
  const used = db.prepare("SELECT count(*) n FROM linkedin_posts WHERE postedAt >= ?").get(start).n
  const limit = Number(getSetting('linkedinWeeklyLimit')) || 10
  return { limit, used, left: Math.max(0, limit - used), weekStart: start }
}
export function setLimit(n) {
  const v = Math.max(1, Math.min(200, Math.round(Number(n) || 10)))
  db.prepare("INSERT INTO settings (key, value) VALUES ('linkedinWeeklyLimit', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(v))
  return usage()
}
export function markPosted(groupId, role = '', now = new Date()) {
  const u = usage(now)
  if (u.left <= 0) throw Object.assign(new Error(`Weekly limit reached (${u.used}/${u.limit}). Wait until next Monday or raise your limit if LinkedIn allows it.`), { status: 409 })
  const g = db.prepare('SELECT id FROM linkedin_groups WHERE id = ?').get(groupId)
  if (!g) throw Object.assign(new Error('Group not found'), { status: 404 })
  const at = now.toISOString().replace('T', ' ').slice(0, 19)
  db.prepare('INSERT INTO linkedin_posts (groupId, role, postedAt) VALUES (?, ?, ?)').run(groupId, String(role).slice(0, 120), at)
  db.prepare('UPDATE linkedin_groups SET lastPosted = ? WHERE id = ?').run(at, groupId)
  return usage(now)
}
export function undoPosted(groupId) {
  const last = db.prepare('SELECT id FROM linkedin_posts WHERE groupId = ? ORDER BY id DESC LIMIT 1').get(groupId)
  if (last) db.prepare('DELETE FROM linkedin_posts WHERE id = ?').run(last.id)
  const prev = db.prepare('SELECT postedAt FROM linkedin_posts WHERE groupId = ? ORDER BY id DESC LIMIT 1').get(groupId)
  db.prepare('UPDATE linkedin_groups SET lastPosted = ? WHERE id = ?').run(prev?.postedAt || null, groupId)
  return usage()
}

const JOBS = /\b(jobs?|hiring|careers?|recruit\w*|openings?|vacanc\w*|referrals?|placements?|walk-?ins?)\b/i
const STOP = new Set(['senior', 'junior', 'lead', 'developer', 'engineer', 'india', 'group', 'professionals', 'network', 'community', 'and', 'the', 'for',
  'hiring', 'urgent', 'urgently', 'required', 'requirement', 'opening', 'openings', 'looking', 'immediate', 'joiner', 'joiners', 'with', 'years', 'yrs', 'experience'])
const CITY = /\b(hyderabad|bengaluru|bangalore|chennai|mumbai|pune|delhi|ncr|noida|gurgaon|gurugram|kolkata|ahmedabad|kochi|trivandrum|coimbatore|indore|jaipur|chandigarh)\b/gi
const SAME_CITY = { bangalore: 'bengaluru', gurgaon: 'gurugram', ncr: 'delhi' }
const cities = (s) => new Set((String(s).match(CITY) || []).map((c) => SAME_CITY[c.toLowerCase()] || c.toLowerCase()))
// Whole-word match, so "java" doesn't hit "javascript" and "go" doesn't hit "google".
const hasWord = (lc, w) => new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(lc)

/** Rank joined groups for a JD. Relevance 55%, size 30%, job-friendly +15%; posted here in the last 7 days -50%. */
export function rank(jdText, count = 10, now = new Date()) {
  const jd = parseJD(jdText)
  const jdCities = cities(jdText)
  const roleWords = [...new Set((String(jdText).split(/\r?\n/)[0] || '').replace(CITY, ' ').toLowerCase().match(/[a-z+#.]{3,}/g)?.filter((w) => !STOP.has(w)) || [])]
  const want = jd.skills.length ? jd.skills : roleWords
  const weekAgo = new Date(now - 7 * 864e5).toISOString().replace('T', ' ').slice(0, 19)
  const groups = listGroups().map((g) => {
    const text = `${g.name} ${g.topics}`
    const have = new Set(findSkills(text))
    const lc = text.toLowerCase()
    const hits = want.filter((s) => have.has(s) || hasWord(lc, s))
    // One matching skill already makes a group relevant (a "Java" group for a Java JD); more matches add a little.
    const rel = hits.length ? Math.min(1, 0.6 + 0.2 * (hits.length - 1)) : 0
    const size = Math.min(1, Math.log10(Math.max(1, g.members)) / 6) // 1M+ members = full marks
    const jobs = JOBS.test(text)
    const recent = g.lastPosted && g.lastPosted >= weekAgo
    // A group tied to another city ("IT Jobs Pune" for a Hyderabad role) or another tech ("Python Jobs" for SAP) is off-target.
    const gCities = cities(g.name)
    const wrongCity = gCities.size > 0 && jdCities.size > 0 && ![...gCities].some((c) => jdCities.has(c))
    const generalJobs = jobs && have.size === 0
    const relevant = !wrongCity && (hits.length > 0 || generalJobs)
    const score = Math.round(Math.max(0, 0.55 * rel + 0.3 * size + (jobs ? 0.15 : 0) - (recent ? 0.5 : 0) - (wrongCity ? 0.3 : 0)) * 100)
    const why = [hits.length ? `matches ${hits.slice(0, 4).join(', ')}` : generalJobs ? 'general job-posting group' : 'no skill match', g.members ? `${g.members.toLocaleString('en-IN')} members` : 'members unknown', jobs && hits.length && 'job-posting group', wrongCity && 'different city', recent && 'you posted here this week'].filter(Boolean)
    return { ...g, score, why, relevant }
  }).sort((a, b) => b.score - a.score)
  const joined = groups.filter((g) => g.status === 'joined' && g.url)
  const picks = joined.filter((g) => g.relevant).slice(0, count)
  const toJoin = groups.filter((g) => g.status !== 'joined' && g.relevant).slice(0, 10)
  return { picks, toJoin, short: Math.max(0, count - picks.length), searches: searchLinks(jd.skills, roleWords) }
}

/** LinkedIn group searches for the JD's skills, to find more large groups to join. */
export function searchLinks(skills, roleWords = []) {
  const role = roleWords.filter((w) => !skills.includes(w)).slice(0, 2).join(' ')
  const terms = [...new Set([
    ...skills.slice(0, 4).map((s) => `${s} jobs`),
    ...skills.slice(0, 2).map((s) => `${s} developers India`),
    role && `${role} jobs India`,
    'IT jobs India', 'tech hiring India',
  ].filter(Boolean))].slice(0, 7)
  return terms.map((t) => ({ label: t, url: `https://www.linkedin.com/search/results/groups/?keywords=${encodeURIComponent(t)}` }))
}
