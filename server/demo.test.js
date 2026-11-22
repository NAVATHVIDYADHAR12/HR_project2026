import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-demo-test-${process.pid}-${Date.now()}.db`)
process.env.TD_DEMO = '1'
const { seedDemo, DEMO_LOGIN } = await import('./demo.js')
const auth = await import('./auth.js')
const { db } = await import('./db.js')

test('demo mode seeds a login and sample data once', () => {
  seedDemo()
  seedDemo() // second start: nothing added twice
  assert.ok(auth.login(DEMO_LOGIN).user)
  assert.equal(db.prepare('SELECT count(*) n FROM users').get().n, 1)
  assert.equal(db.prepare('SELECT count(*) n FROM candidates').get().n, 10)
  assert.ok(db.prepare('SELECT count(*) n FROM linkedin_groups').get().n >= 5)
  assert.ok(!db.prepare("SELECT 1 FROM candidates WHERE pan IS NOT NULL AND pan <> ''").get(), 'no PAN numbers in the public demo')
})
