import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-li-test-${process.pid}-${Date.now()}.db`)
const li = await import('./linkedin.js')

test('members and URLs parse', () => {
  assert.equal(li.parseMembers('12K members'), 12000)
  assert.equal(li.parseMembers('1.2M'), 1200000)
  assert.equal(li.parseMembers('3,456 members'), 3456)
  assert.equal(li.groupUrl('https://www.linkedin.com/groups/1234567/?trk=x'), 'https://www.linkedin.com/groups/1234567/')
  assert.equal(li.groupUrl('9876543'), 'https://www.linkedin.com/groups/9876543/')
  assert.equal(li.groupUrl('https://example.com'), '')
})

test('bulk paste and re-import update instead of duplicating', () => {
  const rows = li.parseGroupLines(`Java Developers India | https://www.linkedin.com/groups/111111/ | 250K members | java, spring
Python Jobs India\thttps://www.linkedin.com/groups/222222/\t80K
DevOps & Cloud Careers | 1.1M | aws, kubernetes, devops
Marketing Pros | https://www.linkedin.com/groups/444444/ | 2M`)
  assert.equal(rows.length, 4)
  assert.deepEqual(rows[0], { name: 'Java Developers India', url: 'https://www.linkedin.com/groups/111111/', members: 250000, topics: 'java, spring' })
  assert.equal(rows[2].url, '')
  assert.equal(rows[2].members, 1100000)
  assert.deepEqual(li.upsertGroups(rows), { added: 4, updated: 0 })
  assert.deepEqual(li.upsertGroups([{ name: 'Java Developers India (official)', url: 'linkedin.com/groups/111111', members: '260K' }]), { added: 0, updated: 1 })
  assert.equal(li.listGroups().length, 4)
  assert.equal(li.listGroups().find((g) => g.url?.includes('111111')).topics, 'java, spring', 'user topics kept')
})

test('a search-page import never un-joins a joined group', () => {
  li.upsertGroups([{ name: 'Python Jobs India', url: 'https://www.linkedin.com/groups/222222/', members: '80K', status: 'not joined' }])
  assert.equal(li.listGroups().find((g) => g.url?.includes('222222')).status, 'joined')
  li.upsertGroups([{ name: 'Brand New Search Group', url: 'https://www.linkedin.com/groups/777777/', members: '10K', status: 'not joined' }])
  assert.equal(li.listGroups().find((g) => g.url?.includes('777777')).status, 'not joined')
})

test('ranking: relevant joined groups first, irrelevant ones left out, unjoined suggested', () => {
  const devops = li.listGroups().find((g) => g.name.startsWith('DevOps'))
  li.updateGroup(devops.id, { status: 'pending', url: 'https://www.linkedin.com/groups/333333/' })
  li.upsertGroups([{ name: 'Spring Boot & Microservices', url: 'https://www.linkedin.com/groups/555555/', members: '5K' }])
  const r = li.rank('Senior Java Developer\nMust have: Java, Spring Boot, Kafka, AWS', 5)
  const names = r.picks.map((g) => g.name)
  assert.equal(names[0], 'Java Developers India (official)')
  assert.ok(names.includes('Spring Boot & Microservices'))
  assert.ok(!names.includes('Marketing Pros'), 'unrelated group not suggested')
  assert.ok(!names.includes('Python Jobs India'), 'a jobs group for another tech is off-target')
  assert.deepEqual(r.toJoin.map((g) => g.name), ['DevOps & Cloud Careers'])
  assert.equal(r.short, 3)
  assert.ok(r.searches[0].url.startsWith('https://www.linkedin.com/search/results/groups/?keywords=java%20jobs'))
})

test('a skill-matched group beats a bigger generic jobs group; no repeated words in searches', () => {
  li.upsertGroups([{ name: 'IT Jobs & Hiring India', url: 'https://www.linkedin.com/groups/888888/', members: '1.2M', status: 'joined' }])
  const r = li.rank('Senior Java Developer – Java, Spring Boot, Kafka, AWS', 10)
  const order = r.picks.map((g) => g.name)
  assert.ok(order.indexOf('Java Developers India (official)') < order.indexOf('IT Jobs & Hiring India'))
  assert.ok(r.searches.every((s) => !/\b(\w+) \1\b/i.test(s.label)), r.searches.map((s) => s.label).join(' / '))
})

test('weekly limit: counts from Monday, blocks at the limit, posted groups drop in rank, undo works', () => {
  const now = new Date('2026-11-25T10:00:00Z') // Wednesday
  assert.equal(li.weekStart(now), '2026-11-23')
  li.setLimit(2)
  const java = li.listGroups().find((g) => g.url?.includes('111111'))
  const spring = li.listGroups().find((g) => g.url?.includes('555555'))
  assert.equal(li.markPosted(java.id, 'Java Dev', now).left, 1)
  assert.equal(li.markPosted(spring.id, 'Java Dev', now).left, 0)
  assert.throws(() => li.markPosted(spring.id, 'x', now), /Weekly limit reached \(2\/2\)/)
  const r = li.rank('Java, Spring Boot', 5, now)
  assert.ok(r.picks.find((g) => g.id === java.id).why.includes('you posted here this week'))
  assert.notEqual(r.picks[0].id, java.id)
  assert.equal(li.undoPosted(spring.id).used, 1)
  assert.equal(li.listGroups().find((g) => g.id === spring.id).lastPosted, null)
})

test('ranking: whole-word skills, off-topic job groups and other cities are left out', () => {
  li.upsertGroups(li.parseGroupLines(`JavaScript Coders | https://www.linkedin.com/groups/5550001/ | 90K | javascript
Python Jobs India | https://www.linkedin.com/groups/5550002/ | 120K | python
IT Jobs Pune | https://www.linkedin.com/groups/5550003/ | 300K | hiring
IT Jobs Hyderabad | https://www.linkedin.com/groups/5550004/ | 300K | hiring
SAP ABAP Consultants | https://www.linkedin.com/groups/5550005/ | 30K | sap abap`))
  const names = li.rank('SAP ABAP Consultant - Hyderabad, 6+ years', 20).picks.map((g) => g.name)
  assert.ok(names.includes('SAP ABAP Consultants'))
  assert.ok(names.includes('IT Jobs Hyderabad'))
  for (const off of ['JavaScript Coders', 'Python Jobs India', 'IT Jobs Pune']) assert.ok(!names.includes(off), off)
  assert.ok(!li.rank('Java Developer\nJava, Spring', 20).picks.some((g) => g.name === 'JavaScript Coders'))
})
