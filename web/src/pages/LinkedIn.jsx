import { useEffect, useState } from 'react'
import { Plus, Upload, Trash2, Search, Loader2, AlertTriangle, Check, ExternalLink, Copy, Download, Undo2, Info, ShieldCheck, ImagePlus, Send } from 'lucide-react'

const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j }
const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json)
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : n ? String(n) : '—')
const readHandoff = () => { try { return JSON.parse(localStorage.getItem('td-linkedin-post') || 'null') } catch { return null } }

export default function LinkedIn() {
  const [groups, setGroups] = useState([])
  const [usage, setUsage] = useState(null)
  const [err, setErr] = useState('')
  const reload = () => fetch('/api/linkedin/groups').then(json).then((r) => { setGroups(r.groups); setUsage(r.usage) }).catch((e) => setErr(e.message))
  useEffect(() => { reload() }, [])

  return (
    <div className="page li-page">
      <header className="hero">
        <p className="eyebrow">Outreach · LinkedIn groups</p>
        <h1>Post where the <em>right people</em> are.</h1>
        <p className="lede">Rank your groups for each JD, stay inside your weekly limit, and post one by one: the app copies the caption and opens the group, you press Post.</p>
      </header>
      <p className="note safe"><ShieldCheck size={18} /> Assisted on purpose: automatic posting or joining breaks LinkedIn’s rules and can get your account restricted. You stay in control of every post.</p>
      {err && <p className="alert"><AlertTriangle size={16} /> {err}</p>}
      {usage && <Usage usage={usage} onChange={setUsage} />}
      <PostFlow groups={groups} usage={usage} onUsage={(u) => { setUsage(u); reload() }} />
      <Groups groups={groups} onChange={reload} />
    </div>
  )
}

function Usage({ usage, onChange }) {
  const [edit, setEdit] = useState(false)
  const [val, setVal] = useState(usage.limit)
  const pct = Math.min(100, (usage.used / usage.limit) * 100)
  return (
    <section className="usage">
      <div className="usage-ring" style={{ '--p': pct }} aria-hidden="true"><span>{usage.left}</span></div>
      <div className="usage-text">
        <strong>{usage.used} of {usage.limit} group posts used this week</strong>
        <span className="muted">{usage.left ? `${usage.left} left until Monday` : 'Limit reached. Resets on Monday.'} · Week from {usage.weekStart}</span>
      </div>
      {edit
        ? <form className="row-gap" onSubmit={async (e) => { e.preventDefault(); onChange((await post('/api/linkedin/limit', { limit: val })).usage); setEdit(false) }}>
            <input className="txt num" type="number" min="1" max="200" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Weekly limit" />
            <button className="ghost">Save</button>
          </form>
        : <button className="link" onClick={() => setEdit(true)}>Change my weekly limit</button>}
    </section>
  )
}

function PostFlow({ groups, usage, onUsage }) {
  const handoff = readHandoff()
  const [jd, setJd] = useState(handoff?.role || '')
  const [count, setCount] = useState(5)
  const [caption, setCaption] = useState(handoff?.caption || '')
  const [image, setImage] = useState(handoff?.image || '')
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState({}) // groupId -> true

  async function rankNow() {
    setBusy(true); setMsg(null)
    try { const r = await post('/api/linkedin/rank', { jd, count }); setPlan(r); setDone({}); onUsage(r.usage) } catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy(false) }
  }
  async function openGroup(g) {
    try { await navigator.clipboard.writeText(caption) } catch { setMsg({ bad: true, text: 'Could not copy the caption. Select it and press Ctrl+C.' }) }
    window.open(g.url, '_blank', 'noopener')
  }
  async function posted(g) {
    try { onUsage((await post('/api/linkedin/posted', { groupId: g.id, role: jd.split('\n')[0] })).usage); setDone({ ...done, [g.id]: true }) }
    catch (e) { setMsg({ bad: true, text: e.message }) }
  }
  async function undo(g) { onUsage((await post('/api/linkedin/undo', { groupId: g.id })).usage); setDone({ ...done, [g.id]: false }) }
  function downloadImage() {
    const a = Object.assign(document.createElement('a'), { href: image, download: 'hiring-poster.png' }); a.click()
  }
  function onImage(file) {
    if (!file?.type.startsWith('image/')) return
    const r = new FileReader(); r.onload = () => setImage(r.result); r.readAsDataURL(file)
  }

  const joined = groups.filter((g) => g.status === 'joined').length
  const left = usage?.left ?? 0
  return (
    <>
    <section className="li-step">
      <div className="step-head"><span className="step">01</span><div><h2>Post a job</h2><p className="muted">Role or JD in, best groups out.</p></div></div>
      {handoff && <p className="note"><Check size={16} /> Poster and caption brought over from Poster Studio.</p>}
      <div className="li-grid">
        <div className="col">
          <label className="field"><span>Role or JD</span><textarea rows={4} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Senior Java Developer – Java, Spring Boot, Kafka, AWS" /></label>
          <div className="row-gap">
            <label className="field inline"><span>Groups to post in</span><input className="txt num" type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></label>
            <button className="cta small" disabled={!jd.trim() || busy || !groups.length} onClick={rankNow}>{busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />} Pick best groups</button>
          </div>
          {!groups.length && <p className="muted">Add your groups first (section 2 below).</p>}
          {groups.length > 0 && !joined && <p className="status bad"><AlertTriangle size={16} /> None of your groups are marked “joined”. You can only post in groups you have joined.</p>}
        </div>
        <div className="col">
          <label className="field"><span>Caption</span><textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Make one in Poster Studio, or write it here." /></label>
          <div className="row-gap">
            {image ? <img className="li-thumb" src={image} alt="Poster to attach" /> : null}
            <label className="file-btn"><ImagePlus size={16} /> {image ? 'Change poster' : 'Add poster image'}<input type="file" accept="image/*" hidden onChange={(e) => onImage(e.target.files[0])} /></label>
            {image && <button className="ghost" onClick={downloadImage}><Download size={16} /> Save poster</button>}
          </div>
        </div>
      </div>
      {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}

      {plan && (
        <div className="queue">
          <h3>Your posting queue</h3>
          {plan.picks.length === 0 && <p className="muted">No joined group matches this role yet. Join some of the groups suggested below.</p>}
          {plan.picks.length > left && <p className="status bad"><AlertTriangle size={16} /> Only {left} post{left === 1 ? '' : 's'} left this week; the rest of the queue waits until Monday.</p>}
          <ol>
            {plan.picks.map((g, i) => {
              const isDone = done[g.id]
              const blocked = !isDone && left <= 0
              return (
                <li key={g.id} className={`q-item ${isDone ? 'done' : ''}`} style={{ '--i': i }}>
                  <span className="q-n">{isDone ? <Check size={16} /> : i + 1}</span>
                  <div className="q-main">
                    <strong>{g.name}</strong>
                    <span className="muted">{g.why.join(' · ')}</span>
                  </div>
                  <span className="q-score">{g.score}</span>
                  <div className="q-actions">
                    {isDone
                      ? <button className="ghost" onClick={() => undo(g)}><Undo2 size={16} /> Undo</button>
                      : <>
                          <button className="ghost" disabled={!caption.trim() || blocked} onClick={() => openGroup(g)}><Copy size={16} /> Copy caption & open</button>
                          <button className="cta small" disabled={blocked} onClick={() => posted(g)}><Check size={16} /> I posted it</button>
                        </>}
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="muted small-note"><Info size={14} /> In the group: click “Start a post”, press Ctrl+V to paste the caption, attach the poster (Save poster above), then Post. Come back and click “I posted it”.</p>

          {(plan.short > 0 || plan.toJoin.length > 0) && (
            <div className="grow">
              <h3>Need more groups?</h3>
              {plan.short > 0 && <p className="muted">You asked for {count}, but only {plan.picks.length} joined group{plan.picks.length === 1 ? '' : 's'} fit this role.</p>}
              {plan.toJoin.length > 0 && (<>
                <p><b>Already in your list but not joined:</b></p>
                <ul className="join-list">{plan.toJoin.map((g) => <li key={g.id}><a href={g.url || '#'} target="_blank" rel="noreferrer">{g.name} <ExternalLink size={12} /></a> <span className="muted">{fmt(g.members)} · {g.status}</span></li>)}</ul>
              </>)}
              <p><b>Find large groups for this role on LinkedIn:</b></p>
              <div className="pills">{plan.searches.map((s) => <a key={s.url} className="ph" href={s.url} target="_blank" rel="noreferrer">{s.label} <ExternalLink size={12} /></a>)}</div>
              <p className="muted small-note">Tip: prefer groups with many members and recent posts; groups with a “Join” button (not “Request to join”) usually let you in straight away. After joining, use the TalentDesk extension on the search page to send the groups here.</p>
            </div>
          )}
        </div>
      )}
    </section>
      <FeedConnect caption={caption} image={image} />
    </>
  )
}

function Groups({ groups, onChange }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState(null)
  const [one, setOne] = useState({ name: '', url: '', members: '', topics: '' })
  const [q, setQ] = useState('')
  async function importText() {
    try { const r = await post('/api/linkedin/import', { text }); setMsg({ text: `${r.added} added, ${r.updated} updated.` }); setText(''); onChange() } catch (e) { setMsg({ bad: true, text: e.message }) }
  }
  async function addOne(e) {
    e.preventDefault()
    try { await post('/api/linkedin/import', { groups: [one] }); setOne({ name: '', url: '', members: '', topics: '' }); onChange() } catch (e2) { setMsg({ bad: true, text: e2.message }) }
  }
  const patch = async (g, p) => { await post(`/api/linkedin/groups/${g.id}`, p, 'PATCH'); onChange() }
  const del = async (g) => { await fetch(`/api/linkedin/groups/${g.id}`, { method: 'DELETE' }); onChange() }
  const shown = groups.filter((g) => !q || `${g.name} ${g.topics}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <section className="li-step">
      <div className="step-head"><span className="step">02</span><div><h2>Your groups</h2><p className="muted">{groups.length} saved · {groups.filter((g) => g.status === 'joined').length} joined</p></div></div>
      <div className="li-grid">
        <form className="col add-group" onSubmit={addOne}>
          <h3>Add one</h3>
          <input className="txt" required value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="Group name" aria-label="Group name" />
          <input className="txt" value={one.url} onChange={(e) => setOne({ ...one, url: e.target.value })} placeholder="https://www.linkedin.com/groups/1234567/" aria-label="Group link" />
          <div className="row-gap">
            <input className="txt" value={one.members} onChange={(e) => setOne({ ...one, members: e.target.value })} placeholder="Members (e.g. 120K)" aria-label="Members" />
            <input className="txt" value={one.topics} onChange={(e) => setOne({ ...one, topics: e.target.value })} placeholder="Topics (java, cloud)" aria-label="Topics" />
          </div>
          <button className="ghost"><Plus size={16} /> Add group</button>
        </form>
        <div className="col">
          <h3>Paste many</h3>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Groups, one per line"
            placeholder={'One per line: Name | link | members | topics\nJava Developers India | https://www.linkedin.com/groups/123456/ | 250K | java, spring'} />
          <button className="ghost" disabled={!text.trim()} onClick={importText}><Upload size={16} /> Import</button>
          <p className="muted small-note">Faster: open LinkedIn → search → Groups (or My groups) and click the TalentDesk extension → “Send LinkedIn groups”.</p>
        </div>
      </div>
      {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text}</p>}
      {groups.length > 0 && (<>
        <label className="search"><Search size={16} aria-hidden="true" /><span className="sr">Filter groups</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter groups…" /></label>
        <div className="table-card plain">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Group</th><th>Members</th><th>Topics</th><th>Status</th><th>Last posted</th><th></th></tr></thead>
              <tbody>
                {shown.map((g, i) => (
                  <tr key={g.id} style={{ '--i': i }}>
                    <td><strong>{g.url ? <a href={g.url} target="_blank" rel="noreferrer">{g.name}</a> : g.name}</strong>{!g.url && <span className="file">No link yet: add one to post</span>}</td>
                    <td>{fmt(g.members)}</td>
                    <td><input className="cell-input" defaultValue={g.topics} onBlur={(e) => e.target.value !== g.topics && patch(g, { topics: e.target.value })} aria-label={`Topics for ${g.name}`} placeholder="add topics" /></td>
                    <td>
                      <select className={`status-select s-${g.status.replace(' ', '-')}`} value={g.status} onChange={(e) => patch(g, { status: e.target.value })} aria-label={`Status of ${g.name}`}>
                        <option value="joined">Joined</option><option value="pending">Requested</option><option value="not joined">Not joined</option>
                      </select>
                    </td>
                    <td>{g.lastPosted ? g.lastPosted.slice(0, 10) : '—'}</td>
                    <td><button className="icon-btn" onClick={() => del(g)} aria-label={`Delete ${g.name}`}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </section>
  )
}

const LI_STEPS = (redirect) => [
  <>Open <a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noreferrer">LinkedIn Developers → Create app</a>. Name it <b>TalentDesk</b>, pick your company’s LinkedIn Page (LinkedIn requires one; your agency page works), add a logo, accept the terms, <b>Create app</b>.</>,
  <>On the <b>Products</b> tab, click <b>Request access</b> on <b>Share on LinkedIn</b> and on <b>Sign In with LinkedIn using OpenID Connect</b> (both are free and instant).</>,
  <>On the <b>Auth</b> tab, under <b>Authorized redirect URLs</b>, add exactly <code>{redirect}</code> and click Update.</>,
  <>Still on <b>Auth</b>, copy the <b>Client ID</b> and the <b>Primary Client Secret</b>, paste them below, click <b>Save</b>, then <b>Connect LinkedIn</b>.</>,
]

/** "Your LinkedIn feed": OAuth connect + one-click post of the poster and caption to the member's own feed. */
function FeedConnect({ caption, image }) {
  const [st, setSt] = useState(null)
  const [cid, setCid] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(() => {
    const e = new URLSearchParams(location.search).get('li_error')
    if (e) history.replaceState({}, '', '/app')
    return e ? { bad: true, text: e } : null
  })
  const [confirm, setConfirm] = useState(false)
  const load = () => fetch('/api/linkedin/api').then(json).then((r) => { setSt(r); setCid((c) => c || r.clientId) }).catch((e) => setMsg({ bad: true, text: e.message }))
  useEffect(() => { load() }, [])
  const run = async (k, fn) => { setBusy(k); setMsg(null); try { await fn() } catch (e) { setMsg({ bad: true, text: e.message }) } finally { setBusy('') } }
  const save = () => run('save', async () => { setSt(await post('/api/linkedin/api/config', { clientId: cid, clientSecret: secret || undefined })); setSecret(''); setMsg({ text: 'Saved. Now click Connect LinkedIn.' }) })
  const connect = () => run('connect', async () => { const r = await post('/api/linkedin/api/start', { returnTo: location.origin }); location.href = r.url })
  const disconnect = () => run('dis', async () => setSt(await post('/api/linkedin/api/disconnect', {})))
  const publish = () => run('post', async () => {
    setConfirm(false)
    const r = await post('/api/linkedin/api/post', { confirm: true, text: caption, image: image || null })
    setMsg({ text: 'Posted to your LinkedIn feed.', link: r.url })
  })
  if (!st) return null
  const days = st.expiresAt ? Math.max(0, Math.round((st.expiresAt - Date.now()) / 864e5)) : 0

  return (
    <section className="li-step li-feed">
      <div className="step-head"><span className="li-logo" aria-hidden="true">in</span><div><h2>Your LinkedIn feed</h2><p className="muted">Post the poster and caption to your own profile in one click, through LinkedIn’s official sign-in.</p></div></div>
      {st.connected ? (<>
        <div className="ms-connected">
          <span className="avatar" aria-hidden="true">{st.person?.name?.[0] || 'L'}</span>
          <div><b>{st.person?.name}</b><small className="muted">{st.person?.email} · access for {days} more day{days === 1 ? '' : 's'}</small></div>
          <span className="pill live"><i aria-hidden="true" />Connected</span>
        </div>
        <div className="row-gap">
          <button className="cta small" disabled={!caption.trim() || !!busy} onClick={() => setConfirm(true)}>{busy === 'post' ? <Loader2 className="spin" size={16} /> : <Send size={16} />} Post to my LinkedIn{image ? ' (with poster)' : ''}</button>
          <button className="ghost danger" disabled={!!busy} onClick={disconnect}>Disconnect</button>
        </div>
        {!caption.trim() && <p className="muted">Write or bring over a caption above first.</p>}
        {confirm && (
          <div className="confirm-box" role="alertdialog" aria-label="Confirm LinkedIn post">
            <p><strong>Post publicly to {st.person?.name}’s LinkedIn feed?</strong> {image ? 'The poster and caption' : 'The caption'} will be visible to everyone. You can delete it on LinkedIn later.</p>
            <div className="row-gap"><button className="cta small" onClick={publish}><Send size={16} /> Yes, post it</button><button className="ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
          </div>
        )}
      </>) : (<>
        {st.expired && <p className="status bad"><AlertTriangle size={16} /> Your LinkedIn access expired (LinkedIn allows 60 days). Click Connect LinkedIn again.</p>}
        <details className="restore" open={!st.clientId}>
          <summary>One-time setup: your free LinkedIn app (about 5 minutes)</summary>
          <ol>{LI_STEPS(st.redirectUri).map((x, i) => <li key={i}>{x}</li>)}</ol>
        </details>
        <div className="li-grid">
          <label className="field"><span>Client ID</span><input className="txt" value={cid} onChange={(e) => setCid(e.target.value.trim())} placeholder="86abc… (from linkedin.com/developers, not your email)" spellCheck="false" autoComplete="off" name="li-app-client-id" data-lpignore="true" /></label>
          <label className="field"><span>Client Secret {st.hasSecret && <em className="muted">(saved; type to replace)</em>}</span><input className="txt" type="password" value={secret} onChange={(e) => setSecret(e.target.value.trim())} autoComplete="new-password" name="li-app-client-secret" data-lpignore="true" placeholder={st.hasSecret ? '••••••••' : 'Primary Client Secret'} /></label>
        </div>
        <div className="row-gap">
          <button className="ghost" disabled={!cid || !!busy} onClick={save}>{busy === 'save' ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save</button>
          <button className="cta small" disabled={!st.clientId || !st.hasSecret || !!busy} onClick={connect}>{busy === 'connect' ? <Loader2 className="spin" size={16} /> : <span className="li-logo sm" aria-hidden="true">in</span>} Connect LinkedIn</button>
        </div>
      </>)}
      {msg && <p className={`status ${msg.bad ? 'bad' : 'ok'}`}>{msg.bad ? <AlertTriangle size={16} /> : <Check size={16} />} {msg.text} {msg.link && <a href={msg.link} target="_blank" rel="noreferrer">View post <ExternalLink size={12} /></a>}</p>}
      <p className="muted small-note"><Info size={14} /> Groups: LinkedIn does not let any app post into groups (that API is closed to the public), so group posts stay one click each in the queue above.</p>
    </section>
  )
}
