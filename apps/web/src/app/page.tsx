import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  const t = useTranslations('app');
  const tn = useTranslations('nav');
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-zinc-600">{t('tagline')}</p>
      <nav className="flex flex-wrap gap-3">
        <Link
          className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800"
          href="/login"
        >
          {tn('logout').replace(/^Odhlásit se$/, 'Přihlášení')}
        </Link>
      </nav>
    </main>
  );
}
