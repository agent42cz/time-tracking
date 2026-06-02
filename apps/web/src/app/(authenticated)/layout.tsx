import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { FaviconSwitcher } from '@/components/FaviconSwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { AuthShell } from './AuthShell';
import { BottomTabBar } from './BottomTabBar';
import { filterVisibleGroups, navGroups } from './nav';

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const session = await requireUser();
  const isAdmin = session.activeRole === 'admin';
  const roleLabel = isAdmin ? 'Správce' : 'Člen';
  const visibleGroups = filterVisibleGroups(navGroups, isAdmin);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <FaviconSwitcher />
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:sticky md:top-0 md:flex dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 px-5 dark:border-zinc-700">
          <Link
            href="/timer"
            className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Time Tracker
          </Link>
        </div>
        <div className="shrink-0 px-3 py-4">
          <CompanySwitcher
            activeCompanyId={session.activeCompanyId}
            memberships={session.memberships}
          />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {visibleGroups.map((group, index) => (
            <div
              key={group.label}
              className={
                index > 0 ? 'mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700' : undefined
              }
            >
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {session.fullName}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{session.email}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-zinc-200 bg-white px-4 pt-[env(safe-area-inset-top)] md:hidden dark:border-zinc-700 dark:bg-zinc-800">
          <Link href="/timer" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Time Tracker
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 md:pb-8">
          <AuthShell>{children}</AuthShell>
        </main>
      </div>
      <BottomTabBar
        isAdmin={isAdmin}
        fullName={session.fullName}
        email={session.email}
        roleLabel={roleLabel}
        activeCompanyId={session.activeCompanyId}
        memberships={session.memberships}
      />
    </div>
  );
}
