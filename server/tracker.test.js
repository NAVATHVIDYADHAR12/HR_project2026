import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

process.env.TD_DB = join(tmpdir(), `td-tracker-test-${process.pid}-${Date.now()}.db`)
const { mapHeader, parseColumnList, readTemplate, buildTracker } = await import('./tracker.js')
const { save, list } = await import('./candidates.js')

test('header names map to fields, unknown ones stay unmapped', () => {
  const cases = {
    'Candidate Name': 'name', 'Mobile No': 'phone', 'Candidate Mobile No': 'phone', 'Email ID': 'email', 'Client Name': 'company',
    'Expected CTC (LPA)': 'ectc', 'CCTC': 'ctc', 'NP': 'notice', 'Notice Period': 'notice', 'Total Experience': 'experience',
    'Remarks': 'reason', 'S.No': 'sno', 'Sl No': 'sno', 'DOB': 'dob', 'PAN Card Number': 'pan', 'Current Location': 'location',
    'Job Location': 'jobLocation', 'Reason for Leaving': 'leavingReason', 'LWD': 'leavingDate', 'Highest Qualification': 'qualification',
    'Date of Joining': null, 'Recruiter': null, 'Source': null,
  }
  for (const [h, f] of Object.entries(cases)) assert.equal(mapHeader(h), f, h)
})

test('typed column list', () => {
  assert.deepEqual(parseColumnList('Name, Phone | Client; Exp CTC\nRecruiter').map((c) => c.field), ['name', 'phone', 'company', 'ectc', null])
})

async function seed() {
  const id = save([{ fields: { name: 'Rahul Sharma', status: 'selected', company: 'Infosys', phone: '+91 98765 43210', pan: 'ABCDE1234F', ectc: '16 LPA', date: '2026-11-10' }, matchId: null }])[0]
  save([{ fields: { name: 'Anita Verma', status: 'rejected', company: 'TCS', reason: 'communication', date: '2026-11-12' }, matchId: null }])
  return id
}

test('default tracker: header styled, full PAN, status coloured, sheet title safe', async () => {
  await seed()
  const buf = await buildTracker(list(), { columns: parseColumnList('S.No, Name, Phone, Client, Status, PAN, Remarks, Recruiter') }, 'Selected / Nov?')
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  assert.equal(ws.name, 'Selected   Nov ')
  assert.deepEqual(ws.getRow(1).values.slice(1), ['S.No', 'Name', 'Phone', 'Client', 'Status', 'PAN', 'Remarks', 'Recruiter'])
  const rahul = ws.getRow(2).values.slice(1)[1] === 'Rahul Sharma' ? ws.getRow(2) : ws.getRow(3)
  assert.equal(rahul.getCell(6).value, 'ABCDE1234F', 'tracker has the full PAN')
  assert.equal(rahul.getCell(5).value, 'Selected')
  assert.ok(rahul.getCell(5).fill?.fgColor?.argb)
  assert.equal(ws.getRow(2).getCell(1).value, 1)
  assert.equal(ws.getRow(2).getCell(8).value, null, 'unknown column left blank')
})

test('template: header row found below a title, sample rows replaced, styling kept', async () => {
  const t = new ExcelJS.Workbook(); const ws = t.addWorksheet('Client Tracker')
  ws.getCell('A1').value = 'ACME Hiring Tracker - Nov'
  ws.getRow(3).values = ['Sl No', 'Candidate Name', 'Contact No', 'Company', 'Status', 'Date of Joining']
  ws.getRow(4).values = [1, 'SAMPLE PERSON', '000', 'X', 'Y', 'Z']
  ws.getRow(4).getCell(2).font = { italic: true }
  ws.getRow(5).values = [2, 'SAMPLE TWO', '111']
  const tpl = Buffer.from(await t.xlsx.writeBuffer())
  const info = await readTemplate(tpl)
  assert.equal(info.headerRow, 3)
  assert.deepEqual(info.columns.map((c) => c.field), ['sno', 'name', 'phone', 'company', 'status', null])
  const out = new ExcelJS.Workbook(); await out.xlsx.load(await buildTracker(list({ status: 'selected' }), { template: tpl, ...info }))
  const o = out.worksheets[0]
  assert.equal(o.getCell('A1').value, 'ACME Hiring Tracker - Nov', 'title kept')
  assert.equal(o.getRow(4).getCell(2).value, 'Rahul Sharma')
  assert.equal(o.getRow(4).getCell(2).font?.italic, true, 'template styling kept')
  assert.equal(o.getRow(5).getCell(2).value, null, 'sample rows cleared')
})

test('Word and PDF exports: real files with the same columns', async () => {
  const { exportAs, setFormat } = await import('./tracker.js')
  const JSZip = (await import('jszip')).default
  setFormat({ type: 'columns', columns: parseColumnList('S.No, Name, Client, Status, Expected CTC, Remarks') })
  const rows = list()
  const docx = await exportAs(rows, 'Selected – Nov', 'docx')
  const doc = await (await JSZip.loadAsync(docx.buf)).file('word/document.xml').async('string')
  assert.match(doc, /<w:t xml:space="preserve">Rahul Sharma<\/w:t>/)
  assert.match(doc, /Expected CTC/)
  assert.match(doc, /w:orient="landscape"/)
  const pdf = await exportAs(rows, 'Selected – Nov ₹', 'pdf')
  assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.buf.length > 1500)
  assert.equal(pdf.mime, 'application/pdf')
  // 300 rows must page-break, not overflow
  const many = Array.from({ length: 300 }, (_, i) => ({ ...rows[0], id: rows[0].id, name: `Person ${i}` }))
  const big = await exportAs(many, 'Big', 'pdf')
  assert.ok((big.buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 5)
})
