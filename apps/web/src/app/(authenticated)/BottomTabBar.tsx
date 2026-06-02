'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavGlyph } from '@/components/nav-icons';
import { MoreSheet, type MobileNavProps } from './MoreSheet';
import { getBottomTabs, type NavItem } from './nav';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function tabClass(active: boolean): string {
  return (
    'flex flex-1 flex-col items-center justify-center gap-1 ' +
    (active
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100')
  );
}

export function BottomTabBar(props: MobileNavProps): ReactElement {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const tabs = getBottomTabs(props.isAdmin);

  return (
    <>
      <nav
        aria-label="Hlavní navigace"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[var(--tab-bar-height)] items-stretch border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-700 dark:bg-zinc-800"
      >
        {tabs.map((tab: NavItem) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={tabClass(active)}
            >
              <NavGlyph icon={tab.icon} className="h-5 w-5" />
              <span className="text-[11px] leading-none">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Více"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={tabClass(moreOpen)}
        >
          <NavGlyph icon="more" className="h-5 w-5" />
          <span className="text-[11px] leading-none">Více</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} {...props} />
    </>
  );
}
