import { signup, hasUsers, HOSTED } from './auth.js'
import { save as saveCandidates } from './candidates.js'
import { upsertGroups, parseGroupLines } from './linkedin.js'
import { saveTemplate } from './mail.js'

// Hosted demo (TD_DEMO=1, e.g. on Vercel): an empty database gets a demo login and made-up sample data.
// Never real candidates: the public site must not hold PAN numbers or phone numbers of real people.
export const DEMO = HOSTED
export const DEMO_LOGIN = { email: 'demo@talentdesk.app', password: 'TalentDesk#Demo1' }

const PEOPLE = [
  ['Arjun Mehta', 'selected', 'Strong Spring Boot + AWS, cleared all rounds', 'Infosys', 'Java Developer', '30 days', '12 LPA', '16 LPA', 'Hyderabad', 'B.Tech CSE', 'Java, Spring Boot, AWS'],
  ['Sneha Reddy', 'selected', 'Excellent communication and system design', 'Infosys', 'Java Developer', 'Immediate', '10 LPA', '14 LPA', 'Hyderabad', 'M.Tech', 'Java, Microservices, Kafka'],
  ['Rahul Verma', 'rejected', 'Weak in Microservices fundamentals', 'Infosys', 'Java Developer', '60 days', '9 LPA', '13 LPA', 'Pune', 'B.E', 'Java, SQL'],
  ['Priya Nair', 'hold', 'Client yet to confirm budget', 'TCS', 'Python Developer', '15 days', '8 LPA', '11 LPA', 'Chennai', 'B.Tech IT', 'Python, Django, AWS'],
  ['Karthik Rao', 'moderate', 'Good Python, limited cloud exposure', 'TCS', 'Python Developer', '30 days', '7 LPA', '10 LPA', 'Bengaluru', 'B.Sc', 'Python, Flask'],
  ['Ananya Singh', 'selected', 'Cleared client round in one go', 'Wipro', 'React Developer', 'Immediate', '6 LPA', '9 LPA', 'Bengaluru', 'B.Tech', 'React, Node.js, TypeScript'],
  ['Vikram Patel', 'rejected', 'Expected CTC too high for budget', 'Wipro', 'DevOps Engineer', '90 days', '15 LPA', '24 LPA', 'Mumbai', 'B.E', 'AWS, Kubernetes, Docker'],
  ['Meera Iyer', 'in process', 'Second round scheduled', 'Accenture', 'Data Analyst', '30 days', '5 LPA', '8 LPA', 'Hyderabad', 'MBA', 'SQL, Power BI, Python'],
  ['Rohit Sharma', 'eliminated', 'Did not attend the interview', 'Accenture', 'Data Analyst', '45 days', '6 LPA', '9 LPA', 'Noida', 'B.Com', 'Excel, SQL'],
  ['Divya Menon', 'hold', 'Candidate on leave till next week', 'Infosys', 'Java Developer', '30 days', '11 LPA', '15 LPA', 'Hyderabad', 'B.Tech', 'Java, Spring Boot'],
]

export function seedDemo() {
  if (!DEMO || hasUsers()) return
  signup({ name: 'Demo Recruiter', ...DEMO_LOGIN })
  saveCandidates(PEOPLE.map(([name, status, reason, company, role, notice, ctc, ectc, location, qualification, skills], i) => ({
    fields: { name, status, reason, company, role, notice, ctc, ectc, location, jobLocation: location, qualification, skills,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`, phone: `98765${String(i + 1).padStart(5, '0')}` },
  })), 'Demo data', 'text')
  upsertGroups(parseGroupLines(`Java Developers India | https://www.linkedin.com/groups/1000001/ | 250K | java, spring
Spring Boot & Microservices | https://www.linkedin.com/groups/1000002/ | 40K | spring boot, microservices
IT Jobs Hyderabad | https://www.linkedin.com/groups/1000003/ | 300K | hiring
Python Jobs India | https://www.linkedin.com/groups/1000004/ | 120K | python, django
React JS Developers | https://www.linkedin.com/groups/1000005/ | 90K | react, javascript
DevOps & Cloud Engineers | https://www.linkedin.com/groups/1000006/ | 60K | aws, kubernetes
Tech Hiring India | https://www.linkedin.com/groups/1000008/ | 500K | jobs`))
  saveTemplate({ name: 'Java openings - first touch', subject: 'Opportunity for Java Developer at Infosys',
    body: 'Hi Ravi,\n\nI came across your profile and found it a great fit for our Java Developer role at Infosys, Hyderabad. The role needs 4-6 years with Java and Spring Boot.\n\nPlease share your updated CV, current CTC and notice period if you are interested.\n\nRegards,\nDemo Recruiter\nTalent Acquisition' })
}
