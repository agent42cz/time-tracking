import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { isTheme, THEME_COOKIE } from '@/lib/theme';
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

const FOUC_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|; )tt_theme=([^;]+)/);var t=c?c[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : 'system';
  const htmlClass = theme === 'dark' ? 'dark' : '';
  return (
    <html lang={locale} className={htmlClass} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <NextIntlClientProvider messages={messages} locale={locale} timeZone="Europe/Prague">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
