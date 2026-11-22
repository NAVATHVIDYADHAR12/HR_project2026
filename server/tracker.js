import ExcelJS from 'exceljs'
import { db } from './db.js'

// F8: Excel tracker. Maps any column names (typed or from a template) onto memory fields.

export const EXPORT_FIELDS = {
  sno: ['s no', 'sno', 'sl no', 'sr no', 'serial no', 'serial number', 'serial', 's.no', 'no', '#'],
  name: ['name', 'candidate name', 'candidate', 'full name', 'name of the candidate', 'candidate full name'],
  phone: ['phone', 'mobile', 'contact', 'contact number', 'contact no', 'mobile number', 'mobile no', 'phone number', 'ph no', 'cell'],
  email: ['email', 'mail', 'email id', 'mail id', 'e-mail', 'email address'],
  status: ['status', 'current status', 'final status', 'selection status', 'result'],
  date: ['date', 'status date', 'interview date', 'selection date', 'offer date', 'updated on', 'last updated'],
  company: ['client', 'client name', 'company', 'company name', 'account', 'hiring company', 'end client', 'organisation', 'organization'],
  role: ['role', 'position', 'designation', 'job title', 'requirement', 'job role', 'profile', 'opening'],
  reason: ['remarks', 'remark', 'reason', 'comments', 'comment', 'feedback', 'rejection reason', 'notes', 'reason for rejection'],
  notice: ['notice', 'notice period', 'np', 'notice days'],
  ctc: ['ctc', 'current ctc', 'cctc', 'current salary', 'present ctc', 'ctc lpa'],
  ectc: ['ectc', 'expected ctc', 'expected salary', 'exp ctc', 'expected', 'expected ctc lpa'],
  experience: ['experience', 'total experience', 'exp', 'years of experience', 'yoe', 'total exp', 'relevant experience', 'exp yrs'],
  currentCompany: ['current company', 'current employer', 'current organization', 'current organisation', 'present company', 'present employer'],
  previousCompany: ['previous company', 'last company', 'prev company', 'previous employer', 'last employer', 'ex company'],
  leavingReason: ['reason for leaving', 'rfl', 'reason for change', 'rfc', 'leaving reason', 'reason for job change'],
  leavingDate: ['lwd', 'last working day', 'leaving date', 'relieving date', 'date of leaving'],
  location: ['current location', 'location', 'residence', 'city', 'present location', 'candidate location', 'lives in'],
  jobLocation: ['job location', 'work location', 'preferred location', 'posting location', 'joining location'],
  qualification: ['qualification', 'highest qualification', 'education', 'degree', 'educational qualification'],
  dob: ['dob', 'date of birth', 'birth date', 'd.o.b'],
  pan: ['pan', 'pan number', 'pan no', 'pan card', 'pan card number'],
  skills: ['skills', 'key skills', 'skill set', 'skillset', 'primary skill', 'technology', 'tech stack', 'primary skills'],
}
export const FIELD_NAMES = {
  sno: 'S.No', name: 'Name', phone: 'Phone', email: 'Email', status: 'Status', date: 'Date', company: 'Client', role: 'Role', reason: 'Remarks',
  notice: 'Notice Period', ctc: 'Current CTC', ectc: 'Expected CTC', experience: 'Experience (yrs)', currentCompany: 'Current Company',
  previousCompany: 'Previous Company', leavingReason: 'Reason for Leaving', leavingDate: 'Last Working Day', location: 'Current Location',
  jobLocation: 'Job Location', qualification: 'Highest Qualification', dob: 'Date of Birth', pan: 'PAN', skills: 'Skills',
}
export const DEFAULT_COLUMNS = ['sno', 'name', 'phone', 'email', 'company', 'role', 'status', 'date', 'notice', 'ctc', 'ectc', 'location', 'jobLocation', 'reason']
  .map((field) => ({ header: FIELD_NAMES[field], field }))

const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9#]+/g, ' ').trim()

/** Header text -> field (or null). Exact synonym first, then the best word overlap. */
export function mapHeader(header) {
  const h = norm(header)
  if (!h) return null
  for (const [field, syns] of Object.entries(EXPORT_FIELDS)) if (syns.some((s) => norm(s) === h)) return field
  const words = new Set(h.split(' '))
  let best = null, bestScore = 0
  for (const [field, syns] of Object.entries(EXPORT_FIELDS)) {
    for (const s of syns) {
      const sw = norm(s).split(' ')
      if (sw.length < 2 && sw[0].length < 4) continue // short synonyms ("no", "np") only match exactly
      const hit = sw.filter((w) => words.has(w)).length
      const score = hit / Math.max(sw.length, words.size)
      if (hit === sw.length && score > bestScore) { best = field; bestScore = score }
    }
  }
  return bestScore >= 0.5 ? best : null
}

/** "Name, Phone, Client | CTC; Remarks" or one per line -> [{header, field}] */
export function parseColumnList(text) {
  return String(text).split(/[,;|\t\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 60).map((header) => ({ header, field: mapHeader(header) }))
}

// Template: the header row is the first row (in the top 15) with at least 2 filled cells.
export async function readTemplate(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('The template has no sheets.')
  for (let r = 1; r <= Math.min(15, ws.rowCount || 15); r++) {
    const row = ws.getRow(r)
    const cells = []
    row.eachCell({ includeEmpty: false }, (cell, col) => { const v = cellText(cell); if (v) cells.push({ col, header: v }) })
    if (cells.length >= 2) return { sheet: ws.name, headerRow: r, columns: cells.map((c) => ({ ...c, field: mapHeader(c.header) })) }
  }
  throw new Error('Could not find a header row in the first 15 rows of the template.')
}
const cellText = (cell) => {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'object') return String(v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '').trim()
  return String(v).trim()
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
function value(row, field, i) {
  switch (field) {
    case 'sno': return i + 1
    case 'status': return cap(row.evStatus ?? row.status) || ''
    case 'company': return row.evCompany ?? row.company ?? ''
    case 'role': return row.evRole ?? row.role ?? ''
    case 'reason': return row.evReason ?? row.reason ?? ''
    case 'date': return row.evDate ?? row.statusDate ?? ''
    case 'experience': return row.experience ?? ''
    default: return row[field] ?? ''
  }
}

// Rows from Ask carry masked PANs; the tracker is the user's own file, so read full PAN + resume experience here.
function enrich(rows) {
  const get = db.prepare('SELECT c.pan, r.years FROM candidates c LEFT JOIN resumes r ON r.id = c.resumeId WHERE c.id = ?')
  return rows.map((r) => { const x = get.get(r.id) || {}; return { ...r, pan: x.pan || '', experience: x.years || '' } })
}

const STATUS_FILL = { Selected: 'FFDCF2E3', Rejected: 'FFFDE4E4', Eliminated: 'FFFDE4E4', Hold: 'FFFBEAD3', Moderate: 'FFFBEAD3', 'In process': 'FFF4E7CC' }

/** Build the workbook. format: { columns:[{header, field}] } or { template: Buffer, headerRow, columns:[{col, header, field}] } */
export async function buildTracker(rows, format = {}, title = 'Tracker') {
  rows = enrich(rows)
  if (format.template) return fillTemplate(rows, format)
  const cols = format.columns?.length ? format.columns : DEFAULT_COLUMNS
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TalentDesk'
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Tracker', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = cols.map((c) => ({ header: c.header, key: c.header, width: Math.min(45, Math.max(10, c.header.length + 4, ...rows.slice(0, 200).map((r, i) => String(c.field ? value(r, c.field, i) : '').length + 2))) }))
  rows.forEach((r, i) => ws.addRow(Object.fromEntries(cols.map((c) => [c.header, (c.field && value(r, c.field, i)) || (c.field === 'sno' ? i + 1 : null)]))))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1917' } }
  head.alignment = { vertical: 'middle' }
  head.height = 22
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  const statusCol = cols.findIndex((c) => c.field === 'status') + 1
  ws.eachRow((row, n) => {
    if (n === 1) return
    row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2DDD4' } } }; cell.alignment = { vertical: 'top', wrapText: true } })
    if (statusCol) { const fill = STATUS_FILL[row.getCell(statusCol).value]; if (fill) row.getCell(statusCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } } }
  })
  return wb.xlsx.writeBuffer()
}

async function fillTemplate(rows, { template, headerRow, columns }) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(template)
  const ws = wb.worksheets[0]
  const styleRow = ws.getRow(headerRow + 1) // keep the template's own data-row styling
  const styles = Object.fromEntries(columns.map((c) => [c.col, { ...styleRow.getCell(c.col).style }]))
  // Clear old data below the header (templates often contain sample rows).
  for (let r = ws.rowCount; r > headerRow; r--) ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => { cell.value = null })
  rows.forEach((r, i) => {
    const row = ws.getRow(headerRow + 1 + i)
    for (const c of columns) {
      const cell = row.getCell(c.col)
      cell.value = c.field ? value(r, c.field, i) : null
      if (styles[c.col]) cell.style = styles[c.col]
    }
    row.commit()
  })
  return wb.xlsx.writeBuffer()
}

// Saved format lives in settings; the template file itself too (base64), so everything stays in one local DB.
export function getFormat() {
  const v = db.prepare("SELECT value FROM settings WHERE key = 'trackerFormat'").get()?.value
  return v ? JSON.parse(v) : { type: 'default', columns: DEFAULT_COLUMNS }
}
export function setFormat(fmt) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('trackerFormat', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(fmt))
  return publicFormat()
}
export function publicFormat() {
  const f = getFormat()
  return { type: f.type, columns: f.columns, templateName: f.templateName, sheet: f.sheet, headerRow: f.headerRow }
}
export async function exportWithSavedFormat(rows, title) {
  const f = getFormat()
  if (f.type === 'template' && f.template) return buildTracker(rows, { template: Buffer.from(f.template, 'base64'), headerRow: f.headerRow, columns: f.columns }, title)
  return buildTracker(rows, { columns: f.columns }, title)
}

/** Same columns as the saved tracker format, as plain text cells (for Word and PDF). */
export function tableFor(rows) {
  const cols = getFormat().columns?.length ? getFormat().columns : DEFAULT_COLUMNS
  const data = enrich(rows).map((r, i) => cols.map((c) => String((c.field && value(r, c.field, i)) ?? '')))
  return { headers: cols.map((c) => c.header), data }
}

const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf' }
export async function exportAs(rows, title, kind = 'xlsx') {
  if (kind === 'docx') return { buf: await toDocx(tableFor(rows), title), mime: MIME.docx }
  if (kind === 'pdf') return { buf: await toPdf(tableFor(rows), title), mime: MIME.pdf }
  return { buf: Buffer.from(await exportWithSavedFormat(rows, title)), mime: MIME.xlsx }
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

// Minimal Word document: title, date line, one landscape table with a dark header row.
export async function toDocx({ headers, data }, title) {
  const { default: JSZip } = await import('jszip')
  const run = (t, { bold, color, size = 18 } = {}) => `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`
  const cell = (t, head) => `<w:tc><w:tcPr>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="1C1917"/>' : ''}</w:tcPr><w:p>${run(t, head ? { bold: true, color: 'FFFFFF' } : {})}</w:p></w:tc>`
  const border = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D6D3D1"/>`
  const table = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map((h) => cell(h, true)).join('')}</w:tr>${data.map((r) => `<w:tr>${r.map((c) => cell(c)).join('')}</w:tr>`).join('')}</w:tbl>`
  const body = `<w:p>${run(title, { bold: true, size: 32 })}</w:p><w:p>${run(`${data.length} candidate${data.length === 1 ? '' : 's'} · TalentDesk · ${new Date().toLocaleDateString('en-IN')}`, { color: '6B645A' })}</w:p>${table}<w:p/>`
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// PDF: landscape A4 table that wraps text and repeats the header on each page.
// shortcut: built-in Helvetica covers Latin text only ("₹" becomes "Rs."); embed a TTF if names in other scripts appear.
export async function toPdf({ headers, data }, title) {
  const { default: PDFDocument } = await import('pdfkit')
  const safe = (s) => String(s).replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, info: { Title: safe(title), Producer: 'TalentDesk' } })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((r) => doc.on('end', r))
  const W = doc.page.width - 60, bottom = doc.page.height - 30
  // Column widths follow content length, with a floor so short columns stay readable.
  const weight = headers.map((h, i) => Math.min(40, Math.max(6, h.length, ...data.slice(0, 200).map((r) => Math.min(40, (r[i] || '').length)))))
  const sum = weight.reduce((a, b) => a + b, 0)
  const widths = weight.map((w) => (w / sum) * W)
  const fs = headers.length > 10 ? 7 : 8, pad = 4
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#17140f').text(safe(title), 30, 30)
  doc.font('Helvetica').fontSize(9).fillColor('#6b645a').text(`${data.length} candidate${data.length === 1 ? '' : 's'} · TalentDesk · ${new Date().toLocaleDateString('en-IN')}`)
  let y = doc.y + 10
  const rowH = (cells, font) => { doc.font(font).fontSize(fs); return Math.max(...cells.map((c, i) => doc.heightOfString(safe(c) || ' ', { width: widths[i] - pad * 2 }))) + pad * 2 }
  const drawRow = (cells, head) => {
    const h = rowH(cells, head ? 'Helvetica-Bold' : 'Helvetica')
    if (y + h > bottom) { doc.addPage(); y = 30; if (!head) drawRow(headers, true) }
    let x = 30
    if (head) doc.rect(30, y, W, h).fill('#1c1917')
    cells.forEach((c, i) => {
      if (!head) doc.rect(x, y, widths[i], h).lineWidth(0.5).strokeColor('#d6d3d1').stroke()
      doc.font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(head ? '#ffffff' : '#17140f').text(safe(c), x + pad, y + pad, { width: widths[i] - pad * 2 })
      x += widths[i]
    })
    y += h
  }
  drawRow(headers, true)
  data.forEach((r) => drawRow(r))
  if (!data.length) doc.font('Helvetica').fontSize(10).fillColor('#6b645a').text('No candidates matched.', 30, y + 10)
  doc.end()
  await done
  return Buffer.concat(chunks)
}
