import './output.css'
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'IP Ping Monitor',
  description: 'Real-time IP Ping Monitoring System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  )
}
