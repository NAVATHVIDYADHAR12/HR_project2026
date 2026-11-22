import { findSkills } from './skills.js'

const STOP = new Set(('a an and are as at be by for from has have in is it its of on or that the to was were will with we you your our they this who all any can should must able strong good excellent ' +
  'experience years year work working role job candidate team skills skill knowledge required requirement requirements responsibilities preferred plus etc using use ' +
  'looking hiring company location salary notice period apply immediate joiner joiners days months domain hybrid remote onsite office ' +
  'must have nice good added advantage bonus optional senior junior lead').split(' '))

const tokens = (t) => (t.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) || []).map((w) => w.replace(/\.+$/, ''))

const NICE = /good\s+to\s+have|nice\s+to\s+have|preferred|added\s+advantage|bonus|optional|plus\b/i

export function parseJD(jd) {
  // Skills only mentioned on "good to have" lines count half.
  const lines = jd.split(/\r?\n/)
  const requiredText = lines.filter((l) => !NICE.test(l)).join('\n')
  let skills = findSkills(jd)
  if (skills.includes('spring boot')) skills = skills.filter((s) => s !== 'spring') // same thing, don't count twice
  const required = new Set(findSkills(requiredText))
  const niceToHave = skills.filter((s) => !required.has(s))
  let minYears = 0, maxYears = 0
  const range = jd.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*(?:\+\s*)?(?:years?|yrs?)/i)
  const plus = jd.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i)
  if (range) [minYears, maxYears] = [+range[1], +range[2]]
  else if (plus) minYears = +plus[1]
  const skillWords = new Set(skills.flatMap((s) => tokens(s)))
  const freq = {}
  for (const w of tokens(jd)) if (!STOP.has(w) && !skillWords.has(w)) freq[w] = (freq[w] || 0) + 1
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w)
  return { skills, niceToHave, minYears, maxYears, keywords }
}

function experienceFit(years, { minYears, maxYears }) {
  if (!minYears) return 1
  if (!years) return 0.4 // unknown: don't zero out, the resume may just not state it
  if (years >= minYears && (!maxYears || years <= maxYears + 2)) return 1
  if (years < minYears) return Math.max(0, years / minYears)
  return 0.8 // overqualified
}

// Score 0-100. Weights: skills 65%, experience 20%, other JD keywords 15%.
export function scoreResume(resume, jd) {
  const text = resume.text.toLowerCase()
  const have = new Set(resume.skills)
  if (have.has('spring boot')) have.add('spring')
  const matched = jd.skills.filter((s) => have.has(s))
  const missing = jd.skills.filter((s) => !have.has(s))
  const nice = new Set(jd.niceToHave || [])
  let required = jd.skills.filter((s) => !nice.has(s))
  if (!required.length) required = jd.skills // JD lists only "good to have": treat those as the requirement
  const req = required.filter((s) => have.has(s)).length / (required.length || 1)
  const niceCov = nice.size ? [...nice].filter((s) => have.has(s)).length / nice.size : 0
  const kwHits = jd.keywords.filter((k) => text.includes(k)).length
  const kw = jd.keywords.length ? Math.min(1, kwHits / Math.min(3, jd.keywords.length)) : 0
  const exp = experienceFit(resume.years, jd)
  // Must-have skills 70%, experience 20%, domain keywords 10%, good-to-have up to +5 bonus.
  const raw = jd.skills.length ? 0.7 * req + 0.2 * exp + 0.1 * kw + 0.05 * niceCov : 0.8 * kw + 0.2 * exp
  return { score: Math.round(Math.min(1, raw) * 100), matched, missing }
}

export function bucket(score, strong = 90, moderate = 60) {
  return score >= strong ? 'strong' : score >= moderate ? 'moderate' : 'weak'
}
