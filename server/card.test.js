import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCard, scoreCards } from './card.js'

test('reads Naukri-style card facts', () => {
  const c = parseCard('Rahul Sharma 6y 3m ₹ 14.5 Lacs Hyderabad Current: Senior Dev at Infosys Key skills: Java, Spring Boot, Kafka Notice: 30 Days Active today')
  assert.equal(c.years, 6.3)
  assert.equal(c.salary, 14.5)
  assert.equal(c.noticeDays, 30)
  assert.equal(c.activeDays, 0)
})

test('expected salary wins over current, months notice, weeks active', () => {
  const c = parseCard('5 Yrs | CTC 10 LPA | Expected CTC 16 LPA | Notice period 2 months | Modified 3 weeks ago')
  assert.equal(c.salary, 16)
  assert.equal(c.noticeDays, 60)
  assert.equal(c.activeDays, 21)
})

test('immediate joiner and raw rupee salary', () => {
  const c = parseCard('4.5 years exp, Immediate joiner, Salary 9,00,000, active 2d ago')
  assert.equal(c.years, 4.5)
  assert.equal(c.noticeDays, 0)
  assert.equal(c.salary, 9)
  assert.equal(c.activeDays, 2)
})

test('filters: fail what is known, flag what is unknown', () => {
  const cards = [
    { name: 'A', text: 'Java Spring Boot Kafka AWS 6y ₹ 14 Lacs Notice: 30 days Active today' },
    { name: 'B', text: 'Java Spring Boot 6y ₹ 30 Lacs Notice: 90 days Active today' },
    { name: 'C', text: 'Java Spring Boot Kafka 5y' }, // no salary/notice shown
  ]
  const r = scoreCards(cards, 'Java developer 4-7 years: Java, Spring Boot, Kafka, AWS', { maxSalary: 20, maxNotice: 30, mustSkills: ['kafka'] })
  assert.equal(r[0].pass, true)
  assert.equal(r[1].pass, false)
  assert.deepEqual(r[1].fails, ['salary > 20L', 'notice > 30d', 'missing kafka'])
  assert.equal(r[2].pass, true)
  assert.deepEqual(r[2].unknown, ['salary > 20L', 'notice > 30d'])
  assert.ok(r[0].score > r[2].score)
})

test('strict: one missing requirement or unshown value rejects; aliases count as present', () => {
  const cards = [
    { text: 'Java, Spring Boot, K8s, AWS · 6y · Notice: 30 days' }, // k8s = kubernetes
    { text: 'Java, Spring Boot, AWS · 6y · Notice: 30 days' }, // no kubernetes
    { text: 'Java, SpringBoot, kubernetes, AWS · Notice: 30 days' }, // experience not shown
  ]
  const r = scoreCards(cards, 'Must have: Java, Spring Boot, Kubernetes, AWS', { strict: true, minYears: 4, mustSkills: ['java'] })
  assert.deepEqual(r.map((x) => x.pass), [true, false, false])
  assert.match(r[1].fails.join(), /missing kubernetes/)
  assert.match(r[2].fails.join(), /exp not shown/)
  // Same cards, normal mode: the unshown experience is only flagged
  assert.equal(scoreCards(cards, 'Java', { minYears: 4 })[2].pass, true)
})

test('must-have skills alone work without a JD', () => {
  const r = scoreCards([{ text: 'Python Django 3 years' }, { text: 'Java 3 years' }], '', { mustSkills: ['python', 'django'] })
  assert.ok(r[0].score > r[1].score)
  assert.equal(r[1].pass, false)
})
