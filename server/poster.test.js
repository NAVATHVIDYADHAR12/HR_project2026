import test from 'node:test'
import assert from 'node:assert/strict'
import { offlineCopy, jdDetails } from './poster.js'

const JD = `Senior Java Developer - Hyderabad
Experience: 4-7 years
Client: Infosys
Notice: Immediate to 30 days
Responsibilities:
- Build and scale payment microservices on AWS
- Own Kafka event pipelines end to end
• Mentor two junior engineers
Must have: Java, Spring Boot, Kafka, AWS`

test('offline copy: tagline, JD bullets as highlights, caption with only known facts', () => {
  const c = offlineCopy(JD, jdDetails(JD), 'priya@agency.com')
  assert.equal(c.tagline, 'Join Infosys in Hyderabad')
  assert.deepEqual(c.highlights, ['Build and scale payment microservices on AWS', 'Own Kafka event pipelines end to end', 'Mentor two junior engineers'])
  assert.match(c.caption, /^We're hiring: Senior Java Developer \(4-7 years\) at Infosys/)
  assert.match(c.caption, /Share your CV: priya@agency\.com/)
  assert.doesNotMatch(c.caption, /CTC/, 'no salary line when the JD has none')
  assert.ok(c.hashtags.includes('#SpringBoot'))
  assert.ok(c.hashtags.includes('#ImmediateJoiners'))
  assert.ok(c.hashtags.includes('#Hyderabad'))
})

test('sparse JD still gives sensible copy', () => {
  const c = offlineCopy('Python developer needed. Django.', jdDetails('Python developer needed. Django.'))
  assert.match(c.caption, /Comment or DM me your CV/)
  assert.ok(!c.hashtags.includes('#ImmediateJoiners'))
  assert.deepEqual(c.highlights, [])
})
