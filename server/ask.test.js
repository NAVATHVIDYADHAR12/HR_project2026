import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-ask-test-${process.pid}-${Date.now()}.db`)
const { save } = await import('./candidates.js')
const { ask, parseQuestion, dateRange } = await import('./ask.js')
const today = new Date('2026-11-22T10:00:00Z')

// Seed: history across months and clients
const add = (fields, date) => save([{ fields: { ...fields, date }, matchId: null }])[0]
const rahul = add({ name: 'Rahul Sharma', status: 'rejected', company: 'Accenture', reason: 'weak Kafka', skills: 'java, kafka', notice: '30 days', location: 'Hyderabad' }, '2026-10-05')
save([{ fields: { status: 'selected', company: 'Infosys', role: 'Java Developer', date: '2026-11-10' }, matchId: rahul }])
add({ name: 'Anita Verma', status: 'rejected', company: 'Infosys', reason: 'poor communication', skills: 'java, spring boot', notice: '60 days', location: 'Pune' }, '2026-11-12')
add({ name: 'Suresh Kumar', status: 'moderate', company: 'Wipro', skills: 'java, aws', notice: 'Immediate', ectc: '14 LPA', location: 'Chennai' }, '2026-11-15')
add({ name: 'Priya Nair', status: 'hold', company: 'Wipro', reason: 'salary expectation too high', skills: 'python, django', notice: '15 days', ectc: '25 LPA' }, '2026-11-20')
add({ name: 'Meera Iyer', status: 'moderate', company: 'TCS', skills: 'java, kafka', notice: '30 days', ectc: '12 LPA', location: 'Hyderabad' }, '2026-11-21')
add({ name: 'Kiran Rao', status: 'selected', company: 'Mphasis', skills: 'python', notice: '45 days' }, '2026-09-01')
const opts = { today }
const names = (r) => r.rows.map((x) => x.name).sort()

test('how many selected till now / this month', () => {
  assert.equal(ask('how many selected till now?', opts).count, 2)
  const m = ask('how many selected this month', opts)
  assert.equal(m.count, 1)
  assert.match(m.text, /^1 candidate/)
})

test('who was rejected for Infosys and why (history, with reason)', () => {
  const r = ask('who was rejected for Infosys and why', opts)
  assert.deepEqual(names(r), ['Anita Verma'])
  assert.ok(r.columns.includes('evReason'))
  assert.equal(r.rows[0].evReason, 'poor communication')
})

test('history: Rahul was rejected by Accenture in October even though now selected', () => {
  assert.deepEqual(names(ask('rejected in october', opts)), ['Rahul Sharma'])
  assert.deepEqual(names(ask('currently rejected candidates', opts)), ['Anita Verma'])
})

test('moderate list without already selected and rejected', () => {
  add({ name: 'Vikram Singh', status: 'moderate', company: 'HCL', skills: 'java' }, '2026-11-18')
  save([{ fields: { status: 'rejected', company: 'HCL', date: '2026-11-19' }, matchId: add({ name: 'Arjun Das', status: 'moderate', company: 'HCL' }, '2026-11-17') }])
  const all = ask('moderate candidates', opts)
  assert.deepEqual(names(all), ['Meera Iyer', 'Suresh Kumar', 'Vikram Singh'])
  const f = parseQuestion('moderate list without already selected and rejected', { ...opts })
  assert.deepEqual(f.excludeStatuses.sort(), ['rejected', 'selected'])
  assert.deepEqual(f.statuses, ['moderate'])
})

test('java candidates excluding anyone selected, except Wipro', () => {
  const r = ask('java candidates remove already selected except Wipro', opts)
  assert.deepEqual(names(r), ['Anita Verma', 'Meera Iyer', 'Vikram Singh'])
})

test('skill + location + immediate / notice / ctc filters', () => {
  assert.deepEqual(names(ask('java people in Hyderabad', opts)), ['Meera Iyer', 'Rahul Sharma'])
  const imm = ask('immediate joiners', opts) // immediate = can join within 15 days
  assert.deepEqual(names(imm), ['Priya Nair', 'Suresh Kumar'])
  assert.match(imm.text, /within 15 days/)
  assert.deepEqual(names(ask('notice less than 30 days', opts)), ['Priya Nair', 'Suresh Kumar'])
  assert.deepEqual(names(ask('expected ctc under 15', opts)), ['Meera Iyer', 'Suresh Kumar'])
})

test('who is on hold, recent 2, details of a person', () => {
  assert.deepEqual(names(ask('who is on hold', opts)), ['Priya Nair'])
  const recent = ask('recent 2', opts)
  assert.equal(recent.count, 2)
  const d = ask('Rahul Sharma', opts)
  assert.ok(d.detail)
  assert.match(d.text, /Rahul Sharma is currently Selected for Infosys/)
  assert.doesNotMatch(d.text, /weak Kafka/, 'old rejection reason must not stick to the new status')
  assert.equal(d.detail.events.find((e) => e.status === 'rejected').reason, 'weak Kafka', 'but stays in history')
  assert.equal(d.detail.events.length, 2)
})

test('no match explains what was searched', () => {
  const r = ask('selected for Google', opts)
  assert.equal(r.count, 0)
  assert.match(r.text, /Selected · for Google/)
})

test('free text falls back to full-text search', () => {
  assert.deepEqual(names(ask('communication', opts)), ['Anita Verma'])
})

test('date ranges', () => {
  assert.deepEqual(dateRange('last month', today), { from: '2026-10-01', to: '2026-10-31', label: 'last month' })
  assert.equal(dateRange('this week', today).from, '2026-11-16')
  assert.equal(dateRange('in december', today).from, '2025-12-01')
  assert.equal(dateRange('last 7 days', today).from, '2026-11-16')
})
