const API = 'http://127.0.0.1:5174' // the app listens on 127.0.0.1 only
const $ = (id) => document.getElementById(id)
const FIELDS = ['jd', 'skills', 'minYears', 'maxYears', 'maxSalary', 'maxNotice', 'activeWithin', 'immediateOnly', 'strict']
let tab, host, lastResults = []

const msg = (text, bad = false) => { $('msg').textContent = text; $('msg').className = bad ? 'bad' : '' }

// Every call to the app carries the key from TalentDesk → Settings (the extension can't use the browser login).
async function api(path, body) {
  const { tdkey } = await chrome.storage.local.get('tdkey')
  let res
  try { res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TD-Key': tdkey || '' }, body: JSON.stringify(body) }) }
  catch { throw new Error('TalentDesk app is not running. Start it (Start TalentDesk.bat) and try again.') }
  const j = await res.json().catch(() => ({}))
  if (res.status === 401) { $('keybox').hidden = false; throw new Error('Paste your TalentDesk key above (TalentDesk → Settings → Extension key).') }
  if (!res.ok) throw new Error(j.error || 'Request failed')
  return j
}
const run = (func, args = []) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).then((r) => r[0]?.result)

async function init() {
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  try { host = new URL(tab.url).hostname } catch { host = '' }
  $('site').textContent = host || 'This page can’t be scanned'
  const saved = await chrome.storage.local.get(['form', 'sel:' + host])
  for (const f of FIELDS) {
    const v = saved.form?.[f]
    if (v !== undefined) $(f).type === 'checkbox' ? ($(f).checked = v) : ($(f).value = v)
  }
  $('layout').textContent = saved['sel:' + host] ? `Using your saved card layout for ${host}.` : ''
  $('li').hidden = !/(^|\.)linkedin\.com$/.test(host)
  const { tdkey } = await chrome.storage.local.get('tdkey')
  $('tdkey').value = tdkey || ''
  $('keybox').hidden = !!tdkey
  $('tdkey').addEventListener('input', () => chrome.storage.local.set({ tdkey: $('tdkey').value.trim() }))
  for (const f of FIELDS) $(f).addEventListener('input', save)
}

function form() {
  const o = {}
  for (const f of FIELDS) o[f] = $(f).type === 'checkbox' ? $(f).checked : $(f).value
  return o
}
const save = () => chrome.storage.local.set({ form: form() })

async function inject() {
  if (!/^https?:/.test(tab.url || '')) throw new Error('Open a job-board search page first (this page is not a website).')
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
}

$('scan').addEventListener('click', async () => {
  const f = form()
  const num = (v) => (v === '' ? undefined : Number(v))
  const filters = {
    minYears: num(f.minYears), maxYears: num(f.maxYears), maxSalary: num(f.maxSalary),
    maxNotice: num(f.maxNotice), activeWithin: num(f.activeWithin), immediateOnly: f.immediateOnly, strict: f.strict,
    mustSkills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
  }
  if (!f.jd.trim() && !filters.mustSkills.length) return msg('Paste a JD or add must-have skills first.', true)
  $('scan').disabled = true
  msg('Reading the page…')
  try {
    await inject()
    const sel = (await chrome.storage.local.get('sel:' + host))['sel:' + host]
    const { cards, source } = await run((s) => window.__tdSourcer.collect(s), [sel || null])
    if (!cards.length) throw new Error('No candidate cards found. Scroll so results are visible, or use "Pick a card".')
    msg(`Scoring ${cards.length} candidates…`)
    const json = await api('/api/extension/score', { cards, jd: f.jd, filters })
    const ranked = json.results.filter((r) => r.pass).sort((a, b) => b.score - a.score)
    ranked.forEach((r, i) => (r.rank = i + 1))
    lastResults = [...ranked, ...json.results.filter((r) => !r.pass)]
    await run((r) => window.__tdSourcer.highlight(r), [json.results])
    render(ranked.length, json.results.length, source)
    msg('')
  } catch (e) {
    msg(e.message, true)
  } finally { $('scan').disabled = false }
})

function render(passCount, total, source) {
  $('out').hidden = false
  $('summary').textContent = `${passCount} of ${total} worth downloading`
  $('list').innerHTML = ''
  for (const r of lastResults) {
    const li = document.createElement('li')
    li.className = r.pass ? (r.score >= 75 ? 'strong' : r.score >= 50 ? 'moderate' : 'weak') : 'fail'
    const facts = [r.years ? `${r.years}y` : '', r.salary != null ? `${r.salary}L` : '', r.noticeDays != null ? (r.noticeDays === 0 ? 'Immediate' : `${r.noticeDays}d notice`) : '', r.activeDays != null ? (r.activeDays === 0 ? 'Active today' : `Active ${r.activeDays}d ago`) : ''].filter(Boolean).join(' · ')
    const why = r.pass ? (r.missing.length ? `Missing: ${r.missing.slice(0, 4).join(', ')}` : 'Has every JD skill') : r.fails.join(', ')
    li.innerHTML = `<button><span class="score">${r.pass ? r.score : '–'}</span><span class="who"><b></b><small></small><small class="why"></small></span></button>`
    li.querySelector('b').textContent = r.name || `Candidate ${r.index + 1}`
    li.querySelector('small').textContent = facts || 'No details shown on card'
    li.querySelector('.why').textContent = why + (r.unknown?.length ? ` · not shown: ${r.unknown.map((u) => u.split(' ')[0]).join(', ')}` : '')
    li.querySelector('button').addEventListener('click', () => run((i) => window.__tdSourcer.scrollTo(i), [r.index]))
    $('list').appendChild(li)
  }
  $('layout').textContent = source === 'saved' ? `Using your saved card layout for ${host}.` : source === 'site' ? `Recognised ${host} layout.` : 'Cards found automatically. If they look wrong, use "Pick a card".'
}

$('groups').addEventListener('click', async () => {
  $('groups').disabled = true
  try {
    await inject()
    // Search results are groups you may not be in yet; "My groups" pages are groups you have joined.
    const status = /\/search\//.test(tab.url) ? 'not joined' : 'joined'
    const groups = (await run(() => window.__tdSourcer.collectGroups())).map((g) => ({ ...g, status }))
    if (!groups.length) throw new Error('No groups found. Open LinkedIn → search → Groups, or your "My groups" page, and scroll so the list is visible.')
    const j = await api('/api/linkedin/import', { groups })
    msg(`${groups.length} groups sent: ${j.added} new, ${j.updated} updated${status === 'joined' ? ' (marked joined).' : '. Join them on LinkedIn, then mark them joined in TalentDesk (or send them again from your My groups page).'}`)
  } catch (e) { msg(e.message, true) } finally { $('groups').disabled = false }
})

$('copy').addEventListener('click', async () => {
  const names = lastResults.filter((r) => r.pass).map((r, i) => `${i + 1}. ${r.name} (${r.score}%)`).join('\n')
  await navigator.clipboard.writeText(names)
  msg('Shortlist copied.')
})
$('pick').addEventListener('click', async () => {
  try { await inject(); await run(() => window.__tdSourcer.pick()); window.close() } catch (e) { msg(e.message, true) }
})
$('clear').addEventListener('click', async () => {
  try { await inject(); await run(() => window.__tdSourcer.clear()); $('out').hidden = true } catch (e) { msg(e.message, true) }
})

init()
