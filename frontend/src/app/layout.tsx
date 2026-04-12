import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ignoranza Artificiale™',
  description: 'Il sistema è operativo. Siamo spiacenti.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
