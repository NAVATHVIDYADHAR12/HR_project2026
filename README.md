# TalentDesk

An HR recruiter's desk for IT hiring, built with **Next.js 16 + React 19** and a Node API on **SQLite**.

- **Resume Matcher**: score hundreds of resumes against a JD into strong (90%+), moderate and weak lists with name, phone and email.
- **Sourcing Extension**: a Chrome extension that screens job-board search results with strict pre-filters before you spend download credits.
- **Candidate Memory**: record selections, rejections and reasons, notice, CTC and more by text, voice or screenshot (OCR).
- **Ask Memory**: offline smart search ("how many selected for Infosys and why?") with Excel, Word and PDF downloads.
- **Mail Drop**: reuse an old mail for a new JD, find candidate emails, send through Outlook (Microsoft Graph) or put drafts in Outlook.
- **Poster Studio** and **LinkedIn Groups**: hiring posters from a JD, and the most relevant groups to share them in, with a weekly limit.
- **Optional AI**: Groq, NVIDIA or OpenRouter. Everything also works without AI.

## Live demo

Hosted on Vercel with **sample data only** (the login page has a "Use the demo login" button).
Each server instance keeps its own temporary database, so demo changes can reset.

## Run on your own computer (real data stays local)

```
npm install
npm run dev        # http://127.0.0.1:5174 (use 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds ~0.3 s per connection)
npm test           # API tests (node:test)
```

Node.js 22.13 or newer. Candidate data lives in `data/` (git-ignored) and the server listens on 127.0.0.1 only.

## Project layout

- `app/`: Next.js App Router pages (the React app in `web/src` loads in the browser)
- `pages/api/[...path].js`: every `/api/*` request goes to the Express API in `server/`
- `server/`: matching, memory, search, mail, Outlook, LinkedIn, AI, exports, and tests
- `extension/`: the Chrome extension
