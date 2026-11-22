import pdf from 'pdf-parse/lib/pdf-parse.js' // direct path: the package index runs a debug self-test
import mammoth from 'mammoth'
import { findSkills } from './skills.js'

export async function extractText(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'pdf') return (await pdf(buffer)).text
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer })).value
  if (ext === 'txt' || ext === 'md') return buffer.toString('utf8')
  throw new Error(`Unsupported file type .${ext} (use PDF, DOCX or TXT)`)
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const NOT_NAME = /resume|curriculum|vitae|\bcv\b|profile|summary|objective|contact|email|phone|mobile|address|@|\d/i

// Any digit run with spaces/dashes/brackets; keep the first that is a valid Indian mobile or an international number.
export function extractPhone(text) {
  for (const m of text.matchAll(/\+?\d[\d \t\-()]{8,16}\d/g)) { // no newlines: don't merge with the next line's numbers
    const d = m[0].replace(/\D/g, '')
    const local = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d
    if (local.length === 10 && /^[6-9]/.test(local)) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
    if (m[0].startsWith('+') && d.length >= 11 && d.length <= 15) return m[0].trim()
  }
  return ''
}

export function extractName(text, email) {
  const labelled = text.match(/\bname\s*[:\-]\s*([A-Za-z][A-Za-z .']{2,40})/i)
  if (labelled) return titleCase(labelled[1].trim())
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8)
  for (const l of lines) {
    const words = l.split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && !NOT_NAME.test(l) && /^[A-Za-z .']+$/.test(l)) return titleCase(l)
  }
  if (email) return titleCase(email.split('@')[0].replace(/[._\d]+/g, ' ').trim())
  return ''
}

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ')

// Largest stated "N years" figure, capped at 40 to ignore noise like "100 years of history".
export function extractYears(text) {
  const re = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s*(?:of)?\s*(?:total|overall|professional|industry|it|work)?\s*experience)?/gi
  let best = 0
  for (const m of text.matchAll(re)) {
    const n = parseFloat(m[1])
    if (n <= 40 && n > best) best = n
  }
  return best
}

export function extractFields(text) {
  const email = (text.match(EMAIL) || [''])[0].toLowerCase()
  return {
    name: extractName(text, email),
    email,
    phone: extractPhone(text),
    skills: findSkills(text),
    years: extractYears(text),
  }
}
