import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFields } from './parse.js'
import { parseJD, scoreResume, bucket } from './match.js'
import { findSkills } from './skills.js'

const JD = 'Hiring Java Developer, 3-6 years. Must have Java, Spring Boot, Microservices, Kafka, AWS, SQL. Banking domain preferred.'
const STRONG = `Rahul Sharma
rahul.sharma@gmail.com | +91 98765 43210
Java developer with 5 years of experience in Spring Boot, Microservices, Kafka, AWS, MySQL and SQL. Worked in banking domain.`
const WEAK = `Priya Nair
priya.n@yahoo.com 9123456789
Graphic designer, 2 years. Figma, Photoshop.`

test('extracts contact fields', () => {
  const f = extractFields(STRONG)
  assert.equal(f.name, 'Rahul Sharma')
  assert.equal(f.email, 'rahul.sharma@gmail.com')
  assert.match(f.phone, /98765\s?43210/)
  assert.equal(f.years, 5)
})

test('phone on its own line does not swallow the next line', () => {
  assert.equal(extractFields('Anita\nMobile: 9988776655\n5 years Java').phone, '+91 99887 76655')
})

test('good-to-have skills count half and spring is not double counted', () => {
  const jd = parseJD('Must have: Java, Spring Boot, Kafka\nGood to have: Kubernetes')
  assert.deepEqual(jd.niceToHave, ['kubernetes'])
  assert.ok(!jd.skills.includes('spring'))
  const r = 'Java, Spring Boot, Kafka'
  assert.equal(scoreResume({ ...extractFields(r), text: r }, jd).missing.join(), 'kubernetes')
})

test('skill matching respects word boundaries', () => {
  assert.deepEqual(findSkills('C++ and C# with .NET'), ['c#', '.net', 'c++'])
  assert.ok(!findSkills('javascript').includes('java'))
})

test('strong resume scores strong, weak scores weak', () => {
  const jd = parseJD(JD)
  assert.equal(jd.minYears, 3)
  const s = scoreResume({ ...extractFields(STRONG), text: STRONG }, jd)
  const w = scoreResume({ ...extractFields(WEAK), text: WEAK }, jd)
  assert.equal(bucket(s.score), 'strong', `strong got ${s.score}`)
  assert.equal(bucket(w.score), 'weak', `weak got ${w.score}`)
  assert.deepEqual(s.missing, [])
})
