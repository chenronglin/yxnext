import type { Metadata } from 'next'

import { I18nProvider } from '@/components/i18n-provider'
import { AppFeedbackProvider } from '@/components/ui/app-feedback'
import { getRequestLocale, getServerMessages, getServerT } from '@/lib/i18n/server'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT()

  // metadata 也走服务端翻译，保证浏览器标题和页面语言保持一致。
  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
    generator: 'v0.app',
    icons: {
      icon: [
        {
          url: '/icon-light-32x32.png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/icon-dark-32x32.png',
          media: '(prefers-color-scheme: dark)',
        },
        {
          url: '/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      apple: '/apple-icon.png',
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getRequestLocale()
  const messages = await getServerMessages(locale)

  return (
    <html lang={locale} className="bg-background">
      <body className="font-sans antialiased">
        <I18nProvider locale={locale} messages={messages}>
          <AppFeedbackProvider>{children}</AppFeedbackProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
