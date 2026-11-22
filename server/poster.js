import { jdDetails } from './mail.js'

// F3: words for the hiring poster + a ready LinkedIn caption. Offline version; AI can improve it.

const tag = (s) => '#' + String(s).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase())

/** Bullet lines from the JD ("- Build APIs", "• Own CI/CD") make good highlights. */
function bullets(jd) {
  return String(jd || '').split(/\r?\n/).map((l) => l.trim())
    .filter((l) => /^([-•*▪●◦]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-•*▪●◦]|\d+[.)])\s+/, '').replace(/[.;]+$/, ''))
    .filter((l) => l.length >= 12 && l.length <= 90 && !/^(must|good)\s+to\s+have|^skills?\s*:/i.test(l))
    .slice(0, 3)
}

export function offlineCopy(jd, d, contact = '') {
  const skills = d.skills ? d.skills.split(/\s*,\s*/).filter(Boolean) : []
  const tagline = d.company && d.location ? `Join ${d.company} in ${d.location}` : d.company ? `Join the team at ${d.company}` : d.location ? `${d.experience ? d.experience + ' · ' : ''}${d.location}` : d.experience ? `${d.experience} of experience` : ''
  const immediate = /immediate/i.test(d.notice || '') && '#ImmediateJoiners'
  const hashtags = [...new Set(['#Hiring', '#JobOpening', d.role && tag(d.role), ...skills.slice(0, 4).map(tag), d.location && tag(d.location.split(/[\s(/]/)[0]), immediate].filter(Boolean))]
  const lines = [
    `We're hiring: ${d.role || 'a new role'}${d.experience ? ` (${d.experience})` : ''}${d.company ? ` at ${d.company}` : ''}`,
    '',
    d.location && `📍 Location: ${d.location}`,
    skills.length && `🛠 Skills: ${skills.join(', ')}`,
    d.experience && `💼 Experience: ${d.experience}`,
    d.notice && `⏳ Notice: ${d.notice}`,
    d.salary && `💰 CTC: ${d.salary}`,
    '',
    contact ? `Interested? Share your CV: ${contact}` : 'Interested? Comment or DM me your CV.',
    'Know someone who fits? Tag them below.',
    '',
    hashtags.join(' '),
  ].filter((l) => l !== false && l !== undefined && l !== 0 && l !== null)
  return { eyebrow: "We're hiring", tagline, highlights: bullets(jd), caption: lines.join('\n').replace(/\n{3,}/g, '\n\n'), hashtags }
}

export async function aiCopy(chat, jd, d, contact = '') {
  const out = await chat([
    { role: 'system', content: `You write copy for an Indian IT recruiter's hiring poster and LinkedIn post. Use ONLY facts from the JD; never invent salary, perks or company names.
Reply with JSON only:
{"eyebrow": "2-4 words, normally \"We're hiring\"; add \"urgent\" ONLY if the JD literally says urgent (an immediate notice period is NOT urgency)", "tagline": "max 9 words, specific to this role", "highlights": ["max 3 items, each max 8 words, concrete things the person will do or get"], "caption": "LinkedIn post, 6-10 short lines, a few relevant emojis, ends with how to apply and 5-8 hashtags", "hashtags": ["#Hiring", "..."]}` },
    { role: 'user', content: `JD:\n${jd.slice(0, 5000)}\n\nKnown details: ${JSON.stringify(d)}\nHow to apply: ${contact || 'DM or comment'}` },
  ], { json: true, maxTokens: 900, temperature: 0.6 })
  const j = out.json
  const str = (v, max) => String(v || '').trim().slice(0, max)
  const copy = {
    eyebrow: str(j.eyebrow, 40) || "We're hiring",
    tagline: str(j.tagline, 90),
    highlights: (Array.isArray(j.highlights) ? j.highlights : []).map((h) => str(h, 90)).filter(Boolean).slice(0, 3),
    caption: str(j.caption, 3000),
    hashtags: (Array.isArray(j.hashtags) ? j.hashtags : []).map((h) => str(h, 40)).filter((h) => /^#\w+$/.test(h)).slice(0, 10),
    provider: out.provider,
  }
  if (!copy.caption) throw new Error('AI returned no caption')
  return copy
}

export { jdDetails }
