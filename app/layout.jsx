import '../web/src/styles.css'
import '../web/src/landing.css'

export const metadata = { title: 'TalentDesk', description: 'HR recruiter desk: resume matching, candidate memory, mail drop, posters and LinkedIn groups.' }

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><div id="root">{children}</div></body>
    </html>
  )
}
