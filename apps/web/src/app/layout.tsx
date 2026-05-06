import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

export const metadata = {
  title: 'Sledování času',
  description: 'Self-hostovaný time tracker',
  icons: {
    icon: [
      { url: '/icons/icon-16-idle.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32-idle.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-48-idle.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-128-idle.png', sizes: '128x128', type: 'image/png' },
    ],
    shortcut: '/icons/icon-32-idle.png',
    apple: '/icons/icon-128-idle.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="bg-zinc-50 text-zinc-900 antialiased">
        <NextIntlClientProvider messages={messages} locale={locale} timeZone="Europe/Prague">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
