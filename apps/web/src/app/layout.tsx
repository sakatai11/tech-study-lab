import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'tech-study-lab',
  description: 'セキュリティ / FE・BEフレームワーク / アーキテクチャ設計を学ぶ学習アプリ',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" data-theme="dark" suppressHydrationWarning>
      <head>
        <Script id="theme-preference" strategy="beforeInteractive">
          {`(() => {
            try {
              const theme = localStorage.getItem('tsl-theme');
              document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'dark';
            } catch {
              document.documentElement.dataset.theme = 'dark';
            }
          })();`}
        </Script>
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  )
}
