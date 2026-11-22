import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Paths from the project folder (process.cwd()), so this works the same under node and when Next.js bundles it.
// TD_DB overrides it (tests; /tmp on Vercel, whose project folder is read-only).
// shortcut: on Vercel each server instance keeps its own /tmp database (demo data, reset on cold start); use a hosted DB for real use.
if (process.env.VERCEL && !process.env.TD_DB) process.env.TD_DB = '/tmp/talentdesk-demo.db'
if (!process.env.TD_DB) mkdirSync(join(process.cwd(), 'data'), { recursive: true })
export const db = new DatabaseSync(process.env.TD_DB || join(process.cwd(), 'data', 'talentdesk.db'))

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT, skills TEXT, years REAL,
  filename TEXT, text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS resumes_fts USING fts5(name, skills, text, content='resumes', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS resumes_ai AFTER INSERT ON resumes BEGIN
  INSERT INTO resumes_fts(rowid, name, skills, text) VALUES (new.id, new.name, new.skills, new.text);
END;
CREATE TRIGGER IF NOT EXISTS resumes_au AFTER UPDATE ON resumes BEGIN
  INSERT INTO resumes_fts(resumes_fts, rowid, name, skills, text) VALUES ('delete', old.id, old.name, old.skills, old.text);
  INSERT INTO resumes_fts(rowid, name, skills, text) VALUES (new.id, new.name, new.skills, new.text);
END;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- F6 candidate memory. One row per person; every status update is also kept in events.
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, email TEXT, phone TEXT, status TEXT, reason TEXT, company TEXT, role TEXT,
  notice TEXT, noticeDays INTEGER, ctc TEXT, ctcLakhs REAL, ectc TEXT, ectcLakhs REAL,
  currentCompany TEXT, previousCompany TEXT, leavingReason TEXT, leavingDate TEXT,
  location TEXT, jobLocation TEXT, qualification TEXT, dob TEXT, pan TEXT, skills TEXT,
  statusDate TEXT, resumeId INTEGER,
  createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS candidates_email ON candidates(email);
CREATE INDEX IF NOT EXISTS candidates_phone ON candidates(phone);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, candidateId INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  date TEXT, status TEXT, company TEXT, role TEXT, reason TEXT, note TEXT, createdAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_candidate ON events(candidateId);
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT, source TEXT, createdAt TEXT DEFAULT (datetime('now')));
CREATE VIRTUAL TABLE IF NOT EXISTS candidates_fts USING fts5(name, body);

-- Accounts. Everyone signed in shares one workspace (the data on this computer).
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passHash TEXT NOT NULL, createdAt TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt TEXT NOT NULL);

-- Help bot: facts the user taught it ("remember: ...").
CREATE TABLE IF NOT EXISTS help_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL, createdAt TEXT DEFAULT (datetime('now')));

-- F4 LinkedIn groups (assisted posting)
CREATE TABLE IF NOT EXISTS linkedin_groups (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT UNIQUE, members INTEGER DEFAULT 0, topics TEXT DEFAULT '',
  status TEXT DEFAULT 'joined', lastPosted TEXT, createdAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS linkedin_posts (id INTEGER PRIMARY KEY, groupId INTEGER, role TEXT, postedAt TEXT DEFAULT (datetime('now')));

-- F10 mail drop
CREATE TABLE IF NOT EXISTS mail_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL, subject TEXT, body TEXT, createdAt TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY, candidateId INTEGER, name TEXT, email TEXT, subject TEXT, role TEXT, method TEXT, status TEXT, error TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);
PRAGMA foreign_keys = ON;
`)

// Same person re-uploaded (by email, else phone) updates the row instead of duplicating it.
export function saveResume(r) {
  const existing = (r.email && db.prepare('SELECT id FROM resumes WHERE email = ?').get(r.email)) ||
    (r.phone && db.prepare('SELECT id FROM resumes WHERE phone = ?').get(r.phone))
  const vals = [r.name, r.email, r.phone, r.skills.join(', '), r.years, r.filename, r.text]
  if (existing) {
    db.prepare('UPDATE resumes SET name=?, email=?, phone=?, skills=?, years=?, filename=?, text=? WHERE id=?').run(...vals, existing.id)
    return existing.id
  }
  return Number(db.prepare('INSERT INTO resumes (name, email, phone, skills, years, filename, text) VALUES (?,?,?,?,?,?,?)').run(...vals).lastInsertRowid)
}
