'use client';

import type { ReactElement } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NavGlyph } from '@/components/nav-icons';
import { getMoreGroups } from './nav';

export interface MobileNavProps {
  isAdmin: boolean;
  fullName: string;
  email: string;
  roleLabel: string;
  activeCompanyId: string | null;
  memberships: { companyId: string; companyName: string; role: string }[];
}

export function MoreSheet({
  open,
  onClose,
  isAdmin,
  fullName,
  email,
  roleLabel,
  activeCompanyId,
  memberships,
}: MobileNavProps & { open: boolean; onClose: () => void }): ReactElement | null {
  const pathname = usePathname();

  // Close whenever the route changes (a nav link was tapped).
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const groups = getMoreGroups(isAdmin);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Více"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-zinc-900/40 md:hidden dark:bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-700 dark:bg-zinc-800">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3 dark:border-zinc-700/60 dark:bg-zinc-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {fullName}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {email} · {roleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <NavGlyph icon="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 py-4">
          <CompanySwitcher activeCompanyId={activeCompanyId} memberships={memberships} />
        </div>

        <nav aria-label="Další navigace" className="px-3 pb-2">
          {groups.map((group, index) => (
            <div
              key={group.label}
              className={
                index > 0 ? 'mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-700/60' : undefined
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
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  >
                    <NavGlyph
                      icon={item.icon}
                      className="h-5 w-5 text-zinc-400 dark:text-zinc-500"
                    />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700/60">
          <ThemeToggle compact />
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
