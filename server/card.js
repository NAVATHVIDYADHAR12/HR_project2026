import { findSkills, normalizeSkills } from './skills.js'
import { scoreResume, parseJD } from './match.js'

// Reads the short facts a job-board search card shows (Naukri, LinkedIn, Indeed, Upwork...).
export function parseCard(text) {
  const t = text.replace(/\s+/g, ' ')
  const lc = t.toLowerCase()

  // Experience: "5y 2m", "5 Yrs 2 Mos", "5.5 years", "Exp: 6+ yrs"
  let years = 0
  const ym = t.match(/(\d{1,2})\s*(?:y|yrs?|years?)\b\s*(?:(\d{1,2})\s*(?:m|mos?|months?)\b)?/i)
  if (ym) years = +ym[1] + (ym[2] ? +ym[2] / 12 : 0)
  const dec = t.match(/(\d{1,2}\.\d)\s*(?:yrs?|years?)/i)
  if (dec) years = +dec[1]
  years = Math.round(years * 10) / 10

  // Salary in lakhs per annum: "12 Lacs", "₹ 12.5 LPA", "CTC 12,00,000", "18L". Prefer the expected figure.
  const lakhs = (s) => {
    if (!s) return null
    const m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(lacs?|lakhs?|lpa|l\b|k\b|cr)?/i)
    if (!m) return null
    let n = parseFloat(m[1].replace(/,/g, ''))
    const unit = (m[2] || '').toLowerCase()
    if (unit === 'cr') n *= 100
    else if (unit === 'k') n = n / 100 // 1,200k per year
    else if (!unit && n >= 10000) n = n / 100000 // raw rupees
    return Math.round(n * 10) / 10
  }
  const SAL = String.raw`(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d+)?\s*(?:lacs?|lakhs?|lpa|l\b|cr)`
  const expected = t.match(new RegExp(`(?:expected|exp\\.?\\s*ctc|ectc)[^0-9₹]{0,20}(${SAL})`, 'i'))
  const current = t.match(new RegExp(`(?:current|ctc|salary)?[^0-9₹]{0,20}(${SAL})`, 'i'))
  const raw = t.match(/(?:ctc|salary|package)[^0-9₹]{0,12}((?:₹|rs\.?|inr)?\s*\d{1,3}(?:,\d{2,3}){2,})/i) // "Salary 9,00,000"
  const salary = lakhs(expected?.[1]) ?? lakhs(current?.[1]) ?? lakhs(raw?.[1])

  // Notice period in days. Immediate / serving notice = 0-15.
  let noticeDays = null
  const immediate = /immediate(ly)?\s*(joiner|available|joining)?|available to join immediately|\b15 days or less\b/i.test(t)
  const nd = t.match(/notice(?:\s*period)?\s*[:\-]?\s*(\d{1,3})\s*(days?|months?)/i) || t.match(/(\d{1,3})\s*(days?|months?)\s*notice/i)
  if (nd) noticeDays = /month/i.test(nd[2]) ? +nd[1] * 30 : +nd[1]
  else if (immediate) noticeDays = 0
  else if (/serving notice/i.test(t)) noticeDays = 15

  // Last active, in days ago.
  let activeDays = null
  if (/active\s*(?:today|now)|modified\s*today|online now|just now/i.test(t)) activeDays = 0
  else if (/(?:active|modified)\s*(?:on\s*)?yesterday/i.test(t)) activeDays = 1
  else {
    const am = t.match(/(?:active|modified|updated|last seen)[^0-9]{0,15}(\d{1,3})\s*(d|days?|w|wks?|weeks?|m|mos?|months?)\b/i)
    if (am) activeDays = +am[1] * (/^w/i.test(am[2]) ? 7 : /^m/i.test(am[2]) ? 30 : 1)
  }

  return { years, salary, noticeDays, immediate, activeDays, skills: findSkills(t), lc }
}

/**
 * Score search cards against a JD and filters.
 * filters: { minYears, maxYears, maxSalary (LPA), maxNotice (days), immediateOnly, activeWithin (days), mustSkills: [] }
 * Normal: unknown values (card doesn't show them) are flagged, not failed, so you don't lose good people.
 * Strict (filters.strict): every requirement must be visibly met — unknown fails, and every must-have
 * skill plus every required JD skill must appear (any known alias counts, e.g. "k8s" for kubernetes).
 */
export function scoreCards(cards, jdText, filters = {}) {
  const jd = parseJD(jdText || '')
  let must = normalizeSkills(filters.mustSkills || [])
  if (!jd.skills.length && must.length) jd.skills = must
  if (filters.strict) must = [...new Set([...must, ...jd.skills.filter((s) => !jd.niceToHave.includes(s))])]
  return cards.map((c, index) => {
    const f = parseCard(c.text)
    const fails = [], unknown = []
    const check = (val, ok, label) => (val == null ? (filters.strict ? fails : unknown).push(filters.strict ? `${label.split(' ')[0]} not shown` : label) : !ok(val) && fails.push(label))
    if (filters.minYears) check(f.years || null, (v) => v >= filters.minYears, `exp < ${filters.minYears}y`)
    if (filters.maxYears) check(f.years || null, (v) => v <= filters.maxYears, `exp > ${filters.maxYears}y`)
    if (filters.maxSalary) check(f.salary, (v) => v <= filters.maxSalary, `salary > ${filters.maxSalary}L`)
    if (filters.maxNotice != null && filters.maxNotice !== '') check(f.noticeDays, (v) => v <= filters.maxNotice, `notice > ${filters.maxNotice}d`)
    if (filters.immediateOnly) check(f.noticeDays, (v) => v <= 15, 'not immediate')
    if (filters.activeWithin) check(f.activeDays, (v) => v <= filters.activeWithin, `inactive > ${filters.activeWithin}d`)
    const have = new Set(f.skills)
    const missingMust = must.filter((s) => !have.has(s) && !f.lc.includes(s))
    if (missingMust.length) fails.push(`missing ${missingMust.join(', ')}`)
    const s = jd.skills.length || jd.keywords.length ? scoreResume({ skills: f.skills, years: f.years, text: c.text }, jd) : { score: 0, matched: [], missing: [] }
    return {
      index, name: c.name || '', score: s.score, matched: s.matched, missing: s.missing,
      years: f.years, salary: f.salary, noticeDays: f.noticeDays, activeDays: f.activeDays,
      pass: fails.length === 0, fails, unknown,
    }
  })
}
