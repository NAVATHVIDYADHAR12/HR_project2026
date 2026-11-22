import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-cand-test-${process.pid}-${Date.now()}.db`)
const { parseNote } = await import('./memory.js')
const { review, save, list, get, knownNames } = await import('./candidates.js')
const { saveResume } = await import('./db.js')

const flow = (text) => review(parseNote(text, { knownNames: knownNames() }))
const accept = (items, note) => save(items.map((i) => ({ fields: i.fields, matchId: i.matchId })), note)

test('new candidate: saved with history; contact details filled from resume', () => {
  saveResume({ name: 'Rahul Sharma', email: 'rahul@x.com', phone: '+91 98765 43210', skills: ['java'], years: 5, filename: 'r.pdf', text: '' })
  const [r] = flow('Rahul Sharma selected for Infosys. Notice 30 days. PAN ABCDE1234F')
  assert.equal(r.matchId, null)
  assert.deepEqual(r.questions, [])
  assert.deepEqual(r.fromResume.sort(), ['email', 'phone', 'skills'])
  const [id] = accept([r], 'note 1')
  const c = get(id)
  assert.equal(c.email, 'rahul@x.com')
  assert.equal(c.pan, 'ABCDE****F', 'PAN masked by default')
  assert.equal(get(id, { revealPan: true }).pan, 'ABCDE1234F')
  assert.equal(c.noticeDays, 30)
  assert.equal(c.events.length, 1)
})

test('update of an existing person by name: no duplicate, history grows', () => {
  const [r] = flow('rahul sharma ectc 18 lpa, lives in Pune')
  assert.ok(r.matchId)
  assert.deepEqual(r.changes.map((c) => c.field).sort(), ['ectc', 'location'])
  accept([r])
  assert.equal(list().length, 1)
  const c = get(r.matchId)
  assert.equal(c.status, 'selected', 'status kept when note has none')
  assert.equal(c.ectcLakhs, 18)
  assert.equal(c.events.length, 2)
})

test('final status changing for the same client must be confirmed', () => {
  const [r] = flow('Rahul Sharma rejected by Infosys due to BGV issue')
  assert.ok(r.questions.some((q) => q.kind === 'confirm' && /currently Selected/.test(q.message)))
  const [r2] = flow('Rahul Sharma rejected by Wipro due to salary') // different client: normal, no question
  assert.ok(!r2.questions.some((q) => q.kind === 'confirm'))
})

test('missing name / status are asked, first-name-only asks which person', () => {
  const [a] = flow('rejected because of poor communication')
  assert.deepEqual(a.questions.map((q) => q.field), ['name'])
  const [b] = flow('Kiran Rao, 5 years Java')
  assert.ok(b.questions.some((q) => q.field === 'status' && q.kind === 'choose'))
  const [c] = flow('Rahul on hold')
  assert.ok(c.questions.some((q) => q.kind === 'match' && q.options[0].label.startsWith('Rahul Sharma')))
})

test('first-name note matched to an existing person keeps the full name', () => {
  const [r] = flow('Rahul on hold')
  const id = r.questions.find((q) => q.kind === 'match').options[0].id
  save([{ fields: r.fields, matchId: id }])
  assert.equal(get(id).name, 'Rahul Sharma')
  assert.equal(get(id).status, 'hold')
})

test('save rejects missing name/status for a new person', () => {
  assert.throws(() => save([{ fields: { name: 'X' }, matchId: null }]), /status is required/)
  assert.throws(() => save([{ fields: { status: 'hold' }, matchId: null }]), /name is required/)
})

test('full-text search finds by skill, company and reason', () => {
  assert.equal(list({ q: 'infos' }).length, 1)
  assert.equal(list({ q: 'java' }).length, 1)
  assert.equal(list({ q: 'kotlin' }).length, 0)
  assert.equal(list({ status: 'hold' }).length, 1) // Rahul, from the previous test
  assert.equal(list({ status: 'selected' }).length, 0)
})
