import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

export const metadata = {
  title: 'Sledování času',
  description: 'Self-hostovaný time tracker',
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
