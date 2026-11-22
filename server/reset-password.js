// Local password reset: `npm run reset-password you@email.com`
// Prints a new temporary password and logs that account out everywhere. Needs access to this computer.
import { randomBytes } from 'node:crypto'
import { db } from './db.js'
import { hashPassword } from './auth.js'

const email = String(process.argv[2] || '').trim().toLowerCase()
if (!email) {
  console.log('Usage: npm run reset-password you@email.com')
  const users = db.prepare('SELECT email FROM users ORDER BY id').all()
  console.log(users.length ? `Accounts on this computer: ${users.map((u) => u.email).join(', ')}` : 'No accounts yet. Open TalentDesk and sign up.')
  process.exit(1)
}
const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
if (!user) { console.log(`No account with the email ${email}.`); process.exit(1) }
const temp = randomBytes(9).toString('base64url')
db.prepare('UPDATE users SET passHash = ? WHERE id = ?').run(hashPassword(temp), user.id)
db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id)
console.log(`New temporary password for ${email}:  ${temp}\nLog in with it, then keep it somewhere safe.`)
