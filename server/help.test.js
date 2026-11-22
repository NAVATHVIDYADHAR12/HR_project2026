import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TD_DB = join(tmpdir(), `td-help-test-${process.pid}-${Date.now()}.db`)
const { reply } = await import('./help.js')
const { save } = await import('./candidates.js')

test('small talk', async () => {
  assert.match((await reply('hi', { loggedIn: true, name: 'Priya Nair' })).reply, /^Hi Priya!/)
  assert.match((await reply('thanks!', { loggedIn: true })).reply, /Happy to help/)
  assert.match((await reply('who are you', { loggedIn: false })).reply, /TalentDesk helper/)
})

test('how-to answers come from the guide, with a link to the page', async () => {
  const r = await reply('how do I install the chrome extension?', { loggedIn: true })
  assert.match(r.reply, /Load unpacked/)
  assert.ok(r.links.some((l) => l.page === 'extension'))
  assert.match((await reply('send mail from my outlook account', { loggedIn: true })).reply, /Sign in with Microsoft/)
  assert.match((await reply('download tracker as pdf', { loggedIn: true })).reply, /PDF/)
  assert.match((await reply('i forgot my password', { loggedIn: false })).reply, /reset-password/)
})

test('data questions answered from memory only when logged in', async () => {
  save([{ fields: { name: 'Rahul Sharma', status: 'selected', company: 'Infosys' }, matchId: null }])
  const r = await reply('how many selected?', { loggedIn: true })
  assert.match(r.reply, /^1 candidate/)
  assert.match(r.reply, /Rahul Sharma/)
  const anon = await reply('how many selected?', { loggedIn: false })
  assert.doesNotMatch(anon.reply, /Rahul/)
})

test('memory training: remember, recall, forget; not for logged-out visitors', async () => {
  assert.match((await reply('remember: Infosys budget for Java is 18 LPA max', { loggedIn: false })).reply, /Log in first/)
  assert.match((await reply('remember: Infosys budget for Java is 18 LPA max', { loggedIn: true })).reply, /I’ll remember/)
  assert.match((await reply('what is the infosys budget for java?', { loggedIn: true })).reply, /18 LPA/)
  assert.match((await reply('forget infosys budget', { loggedIn: true })).reply, /Forgotten/)
  assert.doesNotMatch((await reply('what is the infosys budget for java?', { loggedIn: true })).reply, /18 LPA/)
})

test('unknown question gets a helpful fallback; AI path used when on', async () => {
  assert.match((await reply('blorf zzkq', { loggedIn: true })).reply, /not sure/)
  let seen = ''
  const fakeChat = async (msgs) => { seen = msgs[0].content; return { text: 'AI says hi' } }
  const r = await reply('how do I make a poster?', { loggedIn: true, chat: fakeChat, aiOn: true })
  assert.equal(r.reply, 'AI says hi')
  assert.match(seen, /Poster Studio/, 'guide passed as context')
})
