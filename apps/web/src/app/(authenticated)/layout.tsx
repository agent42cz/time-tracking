import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { FaviconSwitcher } from '@/components/FaviconSwitcher';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const session = await requireUser();
  const isAdmin = session.activeRole === 'admin';

  const navItems: { href: string; label: string; admin?: boolean }[] = [
    { href: '/timer', label: 'Stopky' },
    { href: '/timesheet', label: 'Výkaz' },
    { href: '/dashboard', label: 'Dashboard', admin: true },
    { href: '/reports', label: 'Reporty', admin: true },
    { href: '/clients', label: 'Klienti', admin: true },
    { href: '/tags', label: 'Štítky' },
    { href: '/members', label: 'Členové', admin: true },
    { href: '/audit', label: 'Audit', admin: true },
    { href: '/trash', label: 'Koš', admin: true },
    { href: '/extension', label: 'Rozšíření' },
    { href: '/settings', label: 'Nastavení' },
    { href: '/companies', label: 'Firmy' },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <FaviconSwitcher />
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white md:block">
        <div className="flex h-16 items-center border-b border-zinc-200 px-5">
          <Link href="/timer" className="text-base font-semibold tracking-tight text-zinc-900">
            Time Tracker
          </Link>
        </div>
        <div className="px-3 py-4">
          <CompanySwitcher
            activeCompanyId={session.activeCompanyId}
            memberships={session.memberships}
          />
        </div>
        <nav className="space-y-0.5 px-3">
          {navItems
            .filter((i) => !i.admin || isAdmin)
            .map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                {i.label}
              </Link>
            ))}
        </nav>
        <div className="absolute bottom-0 w-64 border-t border-zinc-200 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{session.fullName}</p>
              <p className="truncate text-xs text-zinc-500">{session.email}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6 md:hidden">
          <Link href="/timer" className="text-base font-semibold">
            Time Tracker
          </Link>
          <LogoutButton />
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
