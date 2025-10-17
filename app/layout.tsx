import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spending Tracker',
  description: 'Track your spending from Chase CSV files',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
