import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNote, toISODate, toLakhs, noticeDays, detectStatuses } from './memory.js'

const today = new Date('2026-11-22T10:00:00Z')

test('full prose note', () => {
  const [c] = parseNote('Rahul Sharma got selected for Infosys Java Developer role today. Notice 30 days, current CTC 12 LPA, expected 16 LPA. Previously worked at TCS, left TCS in March 2024 due to relocation. Lives in Hyderabad, job location Bangalore. B.Tech. DOB 12/05/1995. PAN abcde1234f. rahul.s@gmail.com 9876543210', { today })
  const f = c.fields
  assert.equal(f.name, 'Rahul Sharma')
  assert.equal(f.status, 'selected')
  assert.equal(f.company, 'Infosys')
  assert.equal(f.role, 'Java Developer')
  assert.equal(f.noticeDays, 30)
  assert.equal(f.ctcLakhs, 12)
  assert.equal(f.ectcLakhs, 16)
  assert.equal(f.previousCompany, 'TCS')
  assert.equal(f.leavingDate, '2024-03')
  assert.equal(f.leavingReason, 'relocation')
  assert.equal(f.location, 'Hyderabad')
  assert.equal(f.jobLocation, 'Bangalore')
  assert.equal(f.qualification, 'B.Tech')
  assert.equal(f.dob, '1995-05-12')
  assert.equal(f.pan, 'ABCDE1234F')
  assert.equal(f.email, 'rahul.s@gmail.com')
  assert.equal(f.phone, '+91 98765 43210')
  assert.equal(f.date, '2026-11-22')
  assert.equal(f.reason, undefined, 'leaving reason must not become the status reason')
})

test('several candidates in one note', () => {
  const r = parseNote('Anita Verma rejected by Accenture due to poor communication. Suresh Kumar on hold for Wipro, salary expectation too high. Meera Iyer selected for TCS.', { today })
  assert.deepEqual(r.map((c) => [c.fields.name, c.fields.status, c.fields.company]), [
    ['Anita Verma', 'rejected', 'Accenture'], ['Suresh Kumar', 'hold', 'Wipro'], ['Meera Iyer', 'selected', 'TCS'],
  ])
  assert.equal(r[0].fields.reason, 'poor communication')
})

test('form style / OCR text with labels', () => {
  const r = parseNote(`Candidate Name: Vikram Singh
Status: Rejected
Reason: Not strong in Kafka
Client: HCL
Notice Period: 2 months
Expected CTC: 18 LPA
Current Location: Pune

Name: Kiran Rao
Status: Selected
Client: Mphasis`, { today })
  assert.equal(r.length, 2)
  assert.equal(r[0].fields.name, 'Vikram Singh')
  assert.equal(r[0].fields.status, 'rejected')
  assert.equal(r[0].fields.reason, 'Not strong in Kafka')
  assert.equal(r[0].fields.noticeDays, 60)
  assert.equal(r[0].fields.ectcLakhs, 18)
  assert.equal(r[0].fields.location, 'Pune')
  assert.equal(r[1].fields.name, 'Kiran Rao')
  assert.equal(r[1].fields.company, 'Mphasis')
})

test('OCR text with blank lines between rows stays one person', () => {
  const r = parseNote('Candidate Name: Kiran Rao\nStatus: Selected\n\nClient: Mphasis\n\nNotice Period: 45 days\nExpected CTC: 22 LPA\nCurrent Location: Pune', { today })
  assert.equal(r.length, 1)
  assert.equal(r[0].fields.company, 'Mphasis')
  assert.equal(r[0].fields.noticeDays, 45)
  assert.equal(r[0].fields.location, 'Pune')
})

test('known names from memory are recognised even in lower case speech', () => {
  const [c] = parseNote('put rahul sharma on hold for later', { today, knownNames: ['Rahul Sharma'] })
  assert.equal(c.fields.name, 'Rahul Sharma')
  assert.equal(c.fields.status, 'hold')
})

test('conflicting statuses are flagged, "not selected" is rejected', () => {
  assert.deepEqual(detectStatuses('he was not selected'), ['rejected'])
  const [c] = parseNote('Priya Nair selected but then rejected', { today })
  assert.equal(c.fields.status, undefined)
  assert.deepEqual(c.ambiguous.status.sort(), ['rejected', 'selected'])
})

test('unpunctuated speech: reason stops at next field, expected CTC is not current CTC', () => {
  const [a] = parseNote('anita verma rejected for accenture because communication was weak notice period 60 days', { today, knownNames: ['Anita Verma'] })
  assert.equal(a.fields.reason, 'communication was weak')
  assert.equal(a.fields.company, 'Accenture')
  assert.equal(a.fields.noticeDays, 60)
  const [s] = parseNote('suresh kumar selected for wipro expected ctc 20 lpa immediate joiner', { today, knownNames: ['Suresh Kumar'] })
  assert.equal(s.fields.ectcLakhs, 20)
  assert.equal(s.fields.ctcLakhs, undefined)
})

test('ex-company is previous company, not the client', () => {
  const [c] = parseNote('Arjun Das, 5 yrs, Python. Ex-Cognizant. Rejected by Capgemini', { today })
  assert.equal(c.fields.previousCompany, 'Cognizant')
  assert.equal(c.fields.company, 'Capgemini')
  assert.equal(c.fields.status, 'rejected')
})

test('helpers', () => {
  assert.equal(toISODate('5th Jan 2025'), '2025-01-05')
  assert.equal(toISODate('03/14/2024'), '2024-03-14') // month > 12 in 2nd place -> US order
  assert.equal(toLakhs('₹ 9,50,000'), 9.5)
  assert.equal(toLakhs('1.2 Cr'), 120)
  assert.equal(noticeDays('Immediate joiner'), 0)
  assert.equal(noticeDays('serving notice'), 15)
})

test('"left for better growth" is a reason, not a company', () => {
  const [c] = parseNote('Kiran Kumar selected for Infosys. Previous company HCL, left for better growth, location Hyderabad')
  assert.equal(c.fields.previousCompany, 'HCL')
  assert.equal(c.fields.leavingReason, 'better growth')
  const [d] = parseNote('Ravi on hold, left TCS for better pay')
  assert.equal(d.fields.previousCompany, 'TCS')
  assert.equal(d.fields.leavingReason, 'better pay')
})
