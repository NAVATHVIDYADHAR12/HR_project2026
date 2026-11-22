import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'

process.env.TD_DB = join(tmpdir(), `td-mail-test-${process.pid}-${Date.now()}.db`)
const m = await import('./mail.js')
const { save } = await import('./candidates.js')
const { saveResume, db } = await import('./db.js')

test('JD -> role details', () => {
  const d = m.jdDetails('Senior Java Developer - Hyderabad (Hybrid)\nExperience: 4-7 years\nMust have: Java, Spring Boot, Kafka, AWS\nGood to have: Kubernetes\nClient: Infosys\nNotice: Immediate to 30 days')
  assert.equal(d.role, 'Senior Java Developer')
  assert.equal(d.company, 'Infosys')
  assert.equal(d.experience, '4-7 years')
  assert.equal(d.location, 'Hyderabad')
  assert.equal(d.skills, 'Java, Spring Boot, Kafka, AWS')
  assert.equal(d.notice, 'Immediate to 30 days')
  assert.equal(m.jdDetails('Role: Data Engineer\nPython, Spark, 3+ years').role, 'Data Engineer')
  assert.equal(m.jdDetails('We are hiring a React Developer for our Pune office').role, 'React Developer')
})

test('placeholders fill, case-insensitive, missing reported, greeting falls back', () => {
  const r = m.render({ subject: 'Opening: {Role} at {company}', body: 'Hi {firstName},\nWe have a {role} role needing {skills}. CTC {salary}.' }, { role: 'Java Dev', company: 'Infosys', skills: 'Java' }, { name: 'Rahul Sharma' })
  assert.equal(r.subject, 'Opening: Java Dev at Infosys')
  assert.match(r.body, /^Hi Rahul,/)
  assert.match(r.body, /CTC\./)
  assert.deepEqual(r.missing, ['salary'])
  assert.match(m.render({ subject: '', body: 'Hi {name},' }, {}, {}).body, /Hi there,/)
  assert.equal(m.fill('{unknown} stays', {}).text, '{unknown} stays')
})

test('recipients: memory, resumes, typed email, ambiguous, missing', () => {
  save([{ fields: { name: 'Rahul Sharma', status: 'selected', email: 'rahul@x.com' }, matchId: null }])
  save([{ fields: { name: 'Rahul Verma', status: 'hold', email: 'rv@x.com' }, matchId: null }])
  save([{ fields: { name: 'Anita Verma', status: 'rejected' }, matchId: null }]) // no email in memory...
  saveResume({ name: 'Anita Verma', email: 'anita@y.com', phone: '', skills: [], years: 0, filename: 'a.pdf', text: '' }) // ...but her resume has one
  saveResume({ name: 'Kiran Rao', email: 'kiran@z.com', phone: '', skills: [], years: 0, filename: 'k.pdf', text: '' })
  save([{ fields: { name: 'Meera Iyer', status: 'hold' }, matchId: null }])
  const r = m.resolveRecipients('Rahul Sharma, anita verma\nKiran\nRahul; Meera Iyer, Nobody Here, Boss <boss@corp.com>')
  const by = Object.fromEntries(r.map((x) => [x.input, x]))
  assert.equal(by['Rahul Sharma'].email, 'rahul@x.com')
  assert.equal(by['anita verma'].email, 'anita@y.com')
  assert.equal(by['anita verma'].status, 'ok')
  assert.equal(by.Kiran.name, 'Kiran Rao')
  assert.equal(by.Kiran.source, 'resume')
  assert.equal(by.Rahul.status, 'choose')
  assert.equal(by.Rahul.options.length, 2)
  assert.equal(by['Meera Iyer'].status, 'noemail')
  assert.equal(by['Nobody Here'].status, 'notfound')
  assert.equal(by['Boss <boss@corp.com>'].email, 'boss@corp.com')
  assert.equal(by['Boss <boss@corp.com>'].name, 'Boss')
})

test('send: one by one, logged, history updated; stops when login fails', async () => {
  m.saveSmtp({ preset: 'gmail', host: 'smtp.example.com', port: 465, secure: true, user: 'me@example.com', pass: 'abcd efgh ijkl mnop', fromName: 'Priya HR' })
  assert.equal(m.publicSmtp().hasPassword, true)
  assert.ok(!JSON.stringify(m.publicSmtp()).includes('abcd'), 'password never returned')
  assert.equal(m.getSmtp().pass, 'abcdefghijklmnop', 'spaces removed from app password')

  const sent = []
  const fake = { sendMail: async (o) => { sent.push(o) } }
  const rahul = db.prepare("SELECT id FROM candidates WHERE name = 'Rahul Sharma'").get().id
  const res = await m.sendAll([
    { candidateId: rahul, name: 'Rahul Sharma', email: 'rahul@x.com', subject: 'Java role', body: 'Hi' },
    { name: 'Bad', email: 'not-an-email', subject: 's', body: 'b' },
  ], { transporter: fake, gapMs: 0, role: 'Java Developer' })
  assert.deepEqual(res.map((x) => x.ok), [true, false])
  assert.equal(sent[0].from, '"Priya HR" <me@example.com>')
  assert.equal(sent[0].to, '"Rahul Sharma" <rahul@x.com>')
  assert.ok(db.prepare("SELECT 1 FROM events WHERE candidateId = ? AND reason LIKE 'Mail sent%'").get(rahul))
  assert.equal(m.mailLog().length, 2)

  const authFail = { sendMail: async () => { throw new Error('535 5.7.3 Authentication unsuccessful') } }
  const r2 = await m.sendAll([{ email: 'a@b.co', subject: 's', body: 'b' }, { email: 'c@d.co', subject: 's', body: 'b' }], { transporter: authFail, gapMs: 0 })
  assert.match(r2[0].error, /app password/)
  assert.match(r2[1].error, /stopped/)
})

test('real SMTP error is reported in plain words (closed port)', async () => {
  m.saveSmtp({ host: '127.0.0.1', port: 1, secure: false })
  const r = await m.sendAll([{ email: 'a@b.co', subject: 's', body: 'b' }], { gapMs: 0 })
  assert.match(r[0].error, /Could not reach the mail server/)
})

test('Outlook drafts: .eml files marked unsent, unicode safe, unique names', async () => {
  const buf = await m.draftsZip([
    { name: 'Rahul Sharma', email: 'rahul@x.com', subject: 'Java role – Hyderabad ₹', body: 'Hi Rahul,\nLine 2' },
    { name: 'Rahul Sharma', email: 'rahul2@x.com', subject: 'Second', body: 'x' },
  ])
  const zip = await JSZip.loadAsync(buf)
  assert.deepEqual(Object.keys(zip.files).sort(), ['Rahul Sharma.eml', 'Rahul Sharma_.eml'])
  const e = await zip.file('Rahul Sharma.eml').async('string')
  assert.match(e, /^X-Unsent: 1\r\n/)
  assert.match(e, /Subject: =\?UTF-8\?B\?/)
  const body = Buffer.from(e.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString()
  assert.equal(body, 'Hi Rahul,\r\nLine 2')
})

test('pasted or OCR mail splits into subject and body', () => {
  const r = m.splitMail('From: hr@acme.com\nTo: x@y.com\nSubject: Exciting Java opening\n\nHi {name},\nWe have a role.\n\nRegards')
  assert.equal(r.subject, 'Exciting Java opening')
  assert.equal(r.body, 'Hi {name},\nWe have a role.\n\nRegards')
})

test('offline rewrite: an old mail becomes a template the new JD fills', () => {
  const t = m.templatize('Opportunity for Java Developer at Infosys', 'Hi Ravi,\n\nGreat fit for our Java Developer role at Infosys, Hyderabad. Needs 4-6 years with Java and Spring Boot, Microservices.\n\nRavi, let me know.\n\nRegards,\nVidya\nHR, Acme Staffing')
  assert.equal(t.subject, 'Opportunity for {role} at {company}')
  assert.match(t.body, /^Hi \{firstName\},/)
  assert.match(t.body, /our \{role\} role at \{company\}, \{location\}\. Needs \{experience\} with \{skills\}\./)
  assert.match(t.body, /Regards,\nVidya\nHR, Acme Staffing$/) // signature untouched
  const r = m.render(t, m.jdDetails('Role: Python Developer\nClient: TCS\nLocation: Chennai\nExperience: 3-5 years\nSkills: Python, Django, AWS'), { name: 'Anita Sharma' })
  assert.equal(r.subject, 'Opportunity for Python Developer at TCS')
  assert.match(r.body, /Hi Anita,[\s\S]*Python Developer role at TCS, Chennai\. Needs 3-5 years with Python, Django, AWS\./)
  assert.equal(m.templatize('', 'Hi Team,\nGo ahead and share CVs.').body, 'Hi Team,\nGo ahead and share CVs.')
})
