# TalentDesk: HR Recruiter Platform, Plan & Checklist

This is the file to come back to. Each feature gets built, tested in the browser, then ticked off.

## Stack (kept small on purpose)
| Part | Choice | Why |
|---|---|---|
| Backend | Node 24 + Express | One language for app and extension |
| Database / memory | `node:sqlite` (built into Node) + FTS5 full-text search, file `data/talentdesk.db` | No install, fast local search, works offline |
| Frontend | Vite + React | Fast to build, easy animations |
| Resume parsing | `pdf-parse` (PDF), `mammoth` (DOCX), plain TXT | Runs locally, no API |
| Excel | `exceljs` | Real .xlsx with styling |
| Speech to text | Browser Web Speech API | Free, no key |
| Image to text | `tesseract.js` (OCR) | Free, local |
| AI (optional) | Groq, NVIDIA NIM or OpenRouter (Nemotron). All use the OpenAI-compatible API, so one client handles them, with automatic failover | Everything also works without a key |
| Email | `nodemailer` (SMTP) + Outlook `.eml` drafts | Send from your own account, or no password at all |
| Extension | Chrome Manifest V3 | Works on Naukri, Upwork, LinkedIn, Indeed, etc. |

## Rules
- Everything works **offline, with no API key**. AI only makes results better.
- If AI or the parser is unsure about a field, it **asks you** before saving.
- PAN numbers are stored locally only and shown masked (`ABCDE****F`).
- Every feature is tested in the browser before the next one starts.

## Features

### F1. Resume ↔ JD matcher
- [x] Upload many resumes (PDF/DOCX/TXT) by drag and drop
- [x] Paste or upload the JD
- [x] Extract name, phone, email, skills and years of experience from each resume
- [x] Score: must-have skills 70%, experience 20%, domain keywords 10%, good-to-have up to +5 bonus
- [ ] Optional AI re-rank (added with F5)
- [x] Show 3 tables: **Strong (≥90%)**, **Moderate (60–89%)**, **Weak (<60%)**, with live-adjustable thresholds
- [x] Export tables to Excel (one sheet per bucket)
- [x] Save resumes into memory (re-uploads update the existing entry instead of duplicating)
- [ ] Scanned image-only PDFs: reported as "no readable text"; OCR comes with F6

### F2. Sourcing extension (save download credits)
- [x] Chrome extension popup: paste JD, set filters (min/max experience, active within N days, max salary LPA, max notice, immediate only, must-have skills). Remembered between uses
- [x] One click scans every result card on the current search page (scores through the local TalentDesk app, same scorer as F1)
- [x] Marks cards on the page: green/amber outline with a `#rank · score%` badge; filtered-out cards are faded with "Skip"
- [x] Ranked list in the popup with experience, salary, notice, last active and why; click a name to jump to the card; "Copy names"
- [x] Unknown values (e.g. card doesn't show salary) never knock someone out; they're flagged instead
- [x] Card finding: known Naukri/LinkedIn/Indeed/Upwork selectors → automatic repeated-card finder → "Pick a card" saved per site
- [x] Never downloads anything by itself, so it spends no credits
- [ ] **Waiting on you:** a saved Naukri search results page (Ctrl+S, "Webpage, Complete") in `samples/` to confirm the Naukri reader on real markup
- [ ] **Waiting on you:** load it in your Chrome once (steps below) and scan one real search page

**Install the extension (once):** Chrome → `chrome://extensions` → turn on *Developer mode* (top right) → *Load unpacked* → choose the `extension` folder. Pin it from the puzzle icon. The TalentDesk app must be running (`npm run dev`).

### F3. Hiring poster generator
- [x] Paste the JD → poster filled with role, client, skills, experience, location, notice, CTC (if given), JD bullet points as highlights, and your apply contact
- [x] 4 designs, each its own look: Noir (black + gold, serif), Paper (cream, burnt orange), Gradient (purple → pink, centred), Tech grid (navy, mint, code-style)
- [x] 3 sizes: Square 1:1, Portrait 4:5, Story 9:16; content auto-centred so tall sizes don't look empty; text auto-shrinks to fit, never overlaps the Apply bar
- [x] Reference poster: upload any poster image → its colours are extracted and applied to any design (toggle on/off); accent colour picker; your logo
- [x] Every word editable; live preview + design thumbnails update as you type
- [x] "Catchy words with AI": headline, tagline, 3 highlights and a LinkedIn caption, facts from the JD only
- [x] Ready LinkedIn caption (offline or AI) with hashtags from role, skills and city; one-click copy
- [x] Download PNG at full size (1080 px wide)
- [ ] Reference poster copies colours, not the exact layout (layout copying would need an image AI model)

### F4. LinkedIn group reposting (assisted)
- [x] Group list: name, link, members, topics, status (Joined / Requested / Not joined), last posted; add one, paste many, or send from LinkedIn with the extension
- [x] Extension: on LinkedIn group search or "My groups", one click sends the listed groups (name, link, member count incl. "2,58,123", "48K", "1.2M"); search imports come in as "not joined" and never un-join a joined group
- [x] Rank joined groups for a JD: skill match 55%, size 30%, job-posting groups +15%, posted there this week −50%; you choose how many
- [x] Weekly limit: you set your number (default 10), ring shows used/left from Monday, queue locks when reached
- [x] Assisted posting queue: "Copy caption & open" (copies the caption, opens the group), "Save poster", "I posted it" (logs it), Undo
- [x] Poster Studio → "Use in LinkedIn groups" carries the poster and caption over
- [x] Not enough groups: lists your not-yet-joined matches + LinkedIn group searches for the JD's skills, with joining tips
- [ ] **Waiting on you:** run the extension once on your real LinkedIn "My groups" page
- ⚠️ Fully automatic posting and joining breaks LinkedIn's rules and can get the account restricted, so this stays assisted.

### F5. AI provider settings
- [x] Add a Groq and/or NVIDIA NIM key, "Save & connect" checks the key before storing it
- [x] Model list loaded live from the provider (default NVIDIA: `nvidia/nemotron-3-ultra-550b-a55b`); retired models auto-replaced
- [x] Primary + backup provider, on/off switch, remove key, "Try it" prompt box
- [x] Keys stored locally only (`data/`), never sent back to the browser (shown as `gsk_…abcd`)
- [x] Retries on rate limits (429), fails over to the other provider, strips `<think>` reasoning, retries reasoning models that run out of tokens
- [x] Every AI call falls back to the offline logic if it fails
- [x] F1 "Refine with AI" switch: AI re-scores top 40 (60% AI + 40% offline) with a one-line reason per candidate
- [x] Real keys tested end to end (see F5b)

### F6. Candidate memory (tracker)
- [x] Add updates by **typing**, **speaking** (mic, Indian English) or **image** (drop, browse or Ctrl+V a screenshot; OCR in the browser)
- [x] Fields: name, phone, email, status (selected / rejected / hold / moderate / eliminated / in process), reason, client company, role, notice, CTC, expected CTC, current + previous company, reason and date of leaving, lives in, job location, highest qualification, DOB, PAN, skills, status date
- [x] One note can cover many people (prose or "Label: value" forms / OCR'd trackers)
- [x] Review screen before saving: every field editable; changed fields show "was: …"
- [x] Asks when unsure: missing name, missing or conflicting status, "Rahul" could be Rahul Sharma, a final status changing for the same client, PAN that differs or looks wrong, unreadable DOB. Save stays locked until answered
- [x] Updates the existing person instead of duplicating (email → phone → name); fills phone/email/skills from uploaded resumes
- [x] Full history per person (status, client, role, reason, date) + the raw note kept
- [x] PAN masked everywhere, revealed only on click in the details panel
- [x] Search memory by name, skill, client, reason; filter by status
- [x] Optional "Read with AI": AI reads the note, offline values are kept for email/phone/PAN, AI's doubts become questions
- [ ] **Waiting on you:** try the mic once (needs Chrome/Edge + internet; Chrome sends the audio to Google for transcription)
- [x] AI note reading tested live (typos, shorthand like "np", "hyd", "blr", first names matched to resumes)

### F7. Ask your memory (offline first)
- [x] Questions like "how many selected this month", "who was rejected for Infosys and why", "recent 5", "java candidates in Hyderabad", "moderate list without already selected and rejected", "Rahul Sharma" (full profile + history)
- [x] Offline engine: intent (count / list / why / recent / detail), statuses, exclusions, clients, skills, names, cities, dates (today, this/last week/month/year, "in October", "last 30 days", "since 1 Nov"), notice and expected-CTC limits, free-text fallback
- [x] History-aware: "rejected in October" finds people rejected then even if selected later; "already selected" = ever selected
- [x] Answer sentence + table (reason column for why/rejected/hold) or a profile card with timeline
- [x] Filter chips on every answer: remove any filter, "Hide already selected/rejected", add status, add client; re-runs in place
- [x] "AI" switch: AI only turns the question into filters (only the question is sent, never candidate data); results are always from memory
- [x] Rules: "immediate joiner" = can join within 15 days; "less than/under" is strict, "within/up to" includes the number

### F5b. Live AI keys (added 2026-11-22)
- [x] Groq key saved and live: `openai/gpt-oss-120b` (~1 s) — **primary**
- [x] OpenRouter key saved and live: `nvidia/nemotron-3-ultra-550b-a55b:free` (~2–4 s) — **backup**, used automatically if Groq fails
- [x] Fixed: reasoning models spending their whole answer on thinking (Groq returned empty → silent fallback). Now "think briefly" + bigger budget + retry without strict JSON
- [x] Wrong-card guard: a key pasted into the wrong provider gets a clear message

### F8. Excel tracker export
- [x] In Ask Memory, "send me the current tracker of selected candidates" (any question with tracker / excel / sheet / export / download) downloads the .xlsx straight away
- [x] Every answer has a "Download Excel" button that uses that answer's filters (including chip edits)
- [x] Styled sheet: dark header, frozen header row, filter arrows, coloured status cells, wrapped remarks, sheet named after the question
- [x] **Tracker format** panel: Default columns / My columns (type names in any order) / My template (.xlsx)
- [x] Column names matched automatically (Sl No, Mobile No, Client, NP, ECTC, CCTC, LWD, RFL, Total Experience…); unknown columns stay blank; every match can be changed
- [x] Templates keep title rows, colours, sheet name and data-row styling; sample rows replaced; header row found anywhere in the top 15 rows
- [x] Tracker contains full PAN (it's your own file); the app screens keep it masked
- [ ] Not stored in memory yet, so left blank if asked for: date of joining, recruiter, source

### F10. Mail drop to candidates
- [x] Templates: write, save, edit, delete; import an old mail by pasting it or from a screenshot (OCR); "Subject:" and From/To lines are separated automatically
- [x] Placeholders `{firstName} {name} {role} {company} {skills} {experience} {location} {notice} {salary}`, one-click insert at the cursor
- [x] New JD → details read offline (role, client, skills, experience, location, notice, salary), all editable
- [x] "Rewrite template for this JD" (AI): keeps your tone, structure and signature, swaps the old job for placeholders; one-click undo
- [x] Recipients: type names/emails, or one-click groups (All selected / On hold / Moderate / In process) or a question ("selected for Infosys this month")
- [x] Emails found in memory first, then resumes; asks which person when a name matches several; lets you type a missing email; flags names not found
- [x] Preview every personalised mail; edit any one; untick to skip; warns which mails have empty placeholders
- [x] **Outlook drafts (.zip)**: one .eml per candidate that opens in Outlook as a ready mail (no password)
- [x] **Send now** via your Outlook/Gmail (app password, stored locally, never shown again): confirm step listing recipients, sent one by one 1.5 s apart, stops if the login fails, plain-English errors
- [x] Mail history + "Mail sent/drafted" entry in each candidate's history
- [ ] **Waiting on you:** open one draft in your Outlook; set up Send settings with an app password and send yourself a test mail

### F9. Polish and final checks
- [x] Premium UI: each section has its own motion (marching-ants drop zone, pulsing mic rings, live poster, filling usage ring, sliding queues, drawer), hover effects, light + dark mode (follows Windows on first open), phone + desktop layouts
- [x] Sidebar grouped by workflow: Source → Track → Outreach → Settings; last page remembered
- [x] Crash guard: a failing page shows a "Try again" card instead of a blank app
- [x] Security: server answers this computer only (not the office network); other websites are blocked from calling it; AI keys and email password never sent to the browser
- [x] Backup: Settings → Your data → Download backup (one file with everything) + restore steps
- [x] One-click start for Windows: `Start TalentDesk.bat`
- [x] Full test pass: 73 automated tests incl. an end-to-end run of all 10 features on a fresh server; browser sweep of all 8 pages in light/dark and phone/desktop: 0 crashes, 0 console errors, 0 sideways scrolling

### F11. Home page, accounts, help bot and connections (added 2026-11-22)
- [x] Animated landing page at `/` (word-by-word hero, tilting product preview, marquee, counters, bento features, scroll-drawn steps, padlock, highlighter CTA), back-to-top button, day/night switch
- [x] Sign up / log in at `/signup` and `/login`; the app at `/app` and every API call need a login. Passwords hashed (scrypt), 30-day HttpOnly session, lockout after 8 wrong passwords, `npm run reset-password you@email`
- [x] Extension: **Download extension (.zip)** on the Sourcing Extension page, key shown with Copy; popup takes job title or JD, unlimited must-have skills, experience; **Strict** (default on) rejects a profile if any requirement is missing or not shown; skill aliases count (k8s = Kubernetes)
- [x] Candidate Memory list and every Ask Memory answer download as **Excel, Word or PDF**; "…tracker in PDF / as Word" works in questions
- [x] Help chatbot on every page (full screen on phones): small talk, how-to from a built-in guide, data answers from memory (only when logged in), "remember: …" / "forget …" training, AI phrasing when a key is set
- [x] Mail Drop → **Sign in with Microsoft (Outlook)**: device-code OAuth (token, never a password), auto-renewing; Send now from your mailbox and **Put drafts in my Outlook**; app-password option kept
- [x] LinkedIn → **Connect LinkedIn** (official OAuth) and **Post to my LinkedIn** (poster + caption, real hashtags, confirm first, 60-day access); group posting stays assisted because LinkedIn's API doesn't allow it
- [x] Outlook connected (2026-11-22): Entra app "TalentDesk" (personal accounts, public client flows, desktop return addresses); signed in with the owner's Microsoft account; test draft created in Outlook Drafts (nothing sent). Sign-in uses Account type = Personal
- [ ] LinkedIn connection skipped by choice: LinkedIn requires a company page you admin (you have none yet). Assisted group posting works; connect later from LinkedIn Groups → Your LinkedIn feed
- [x] Your TalentDesk account created

## Build order
F1 ✅ → F5 ✅ → F2 ✅ → F6 ✅ → F7 ✅ → F8 ✅ → F10 ✅ → F3 ✅ → F4 ✅ → F9 ✅  **All features built.**

## Still needs you (things only you can test)
1. **Extension in your Chrome:** load it (steps in the app → Sourcing Extension), scan one real Naukri search page, and send your real LinkedIn "My groups" list. If Naukri cards aren't found automatically, use "Pick a card" once; a saved Naukri page in `samples/` lets me tune it.
2. **Microphone:** speak one note in Candidate Memory (Chrome/Edge, internet needed).
3. **Outlook:** double-click one downloaded draft; and/or set up Send settings with an app password and send yourself a test mail.
4. **Rotate your AI keys** if this chat may be seen by others (Groq and OpenRouter websites → new key → paste in Settings).
5. **Move the project out of OneDrive** (e.g. `C:\Projects\TalentDesk`): OneDrive syncing thousands of library files slows everything and caused dev-server restarts.

## Known limits (by design)
- LinkedIn posting and joining are assisted, never automatic (LinkedIn restricts accounts that automate).
- Reference posters give colours, not exact layouts.
- Scanned image-only PDF resumes need OCR: screenshot them into Candidate Memory, or ask for PDF OCR in the matcher as a next step.
- Memory doesn't store date of joining, recruiter or source yet (tracker leaves those columns blank).

## Progress log
- 2026-11-22: Plan written. Starting F1.
- 2026-11-22: **F1 done.** 5 unit tests pass. API tested with TXT, PDF and DOCX samples (`samples/`). UI tested in the browser: upload, wrong file type rejected, 3 tables, live threshold slider, Excel export, dark mode.

- 2026-11-22: **F10 mail drop added to the plan.** **F5 done** except a live-key test: 14 unit tests pass (fake provider server covers retry, failover, thinking, bad keys). Fake keys are rejected by the real Groq and NVIDIA servers. Fixed: phone-width layout scrolled sideways.

- 2026-11-22: **F2 built.** 19 tests pass. Tested on a mock search page (`samples/mock_search.html`): auto-finder found all 6 cards and skipped the sidebar, filters correct, pick-a-card works from any click point and on class-less markup. Fixed: badge covering names, pick mode saving a line instead of the card.

- 2026-11-22: **F6 done.** 35 tests pass. Browser-tested: 2-person note, questions + save lock, update without duplicate, history timeline, PAN reveal, OCR of a tracker screenshot (4 s), search, phone layout. Fixed: "Rahul" overwriting "Rahul Sharma" on update; OCR blank lines splitting one person into three; reason swallowing the next field in speech. Test data cleared from the database.

- 2026-11-22: **Keys live + F7 done.** 47 tests pass. Live AI tested in matcher (7 resumes, 3 s on Groq, 5 s on Nemotron), memory note reading (typos/shorthand), and Ask (slang questions). Fixed: old rejection reason sticking to a new status; "less than 30" including 30; answers landing behind the ask bar. Demo data cleared; keys kept.

- 2026-11-22: **F8 done.** 51 tests pass. Tested: auto-download from a tracker question, typed columns, client template with title row and sample rows, wrong file type, column matching. Format reset to default; demo data cleared.

- 2026-11-22: **F10 done.** 58 tests pass (sending tested with a stand-in mail server and a real closed port; no real mail sent). Browser-tested the full flow: template save, JD details, AI rewrite (live), group + typed recipients with every lookup case, preview, drafts zip, send-without-account refusal, history. Fixed: dev server restarting mid-request because the project is in OneDrive (now watches only `server/`). Demo data cleared.

- 2026-11-22: **F3 done.** 60 tests pass, production build OK. Every design and size inspected at full resolution. Fixed: tall story poster leaving a big empty gap; square Gradient dropping details; AI calling an "immediate notice" job "urgent"; detail rows too tight.

- 2026-11-22: **F4 done.** 66 tests pass, build OK. Tested: extension group reader on a mock LinkedIn page, poster → LinkedIn handoff, ranking, queue, weekly limit lock, undo. Fixed: "3,456 members" read as 3.4 billion; search imports marked joined; generic jobs group outranking a skill-matched one; repeated words in search suggestions.

- 2026-11-22: **Outlook live.** Fixed: a sign-in waiting for approval was lost when the dev server restarted (now stored in the database).
- 2026-11-22: **F11 done.** 91 tests pass (Microsoft and LinkedIn tested against stand-in servers; a real Microsoft call checked the error path). Fixed: chat messages sharing a class with the chat panel; wrong Microsoft error for unknown Client IDs; chat bubble over drawers; landing nav links stacking; bento grid gap.
- 2026-11-22: **F9 done.** 73 tests pass (incl. end-to-end), production build OK, browser sweep clean. Fixed: server reachable from the office network; other websites able to call the API; unknown API routes returning HTML; a broken page blanking the whole app.

## How to run
**Everyday use (Windows):** double-click **`Start TalentDesk.bat`**. It installs on first run, builds, and opens http://127.0.0.1:5174. Keep its window open; close it to stop.

**Development:**
```
npm install
npm run dev        # http://localhost:5173 (hot reload)
npm test           # all 73 tests, incl. end-to-end
npm start          # build + serve on http://127.0.0.1:5174
```
Data lives in `data/talentdesk.db` (excluded from git). Back it up from Settings → Your data.
