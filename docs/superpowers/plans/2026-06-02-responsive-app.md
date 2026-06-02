# Full Responsiveness (360px → desktop) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web app fully usable from 360px phones to desktop — a real mobile nav (bottom tab bar + More sheet), table→card layouts, and responsive primitives/pages — with zero behavioural change.

**Architecture:** Four layers, implemented in order: (1) **foundation** (viewport meta, safe-area, z-index scale, global spacing), (2) **shell nav** (role-aware bottom tab bar + More sheet, replacing the dead mobile header), (3) shared **primitives** (`packages/ui` + `components/`), (4) **per-page sweep**. A Playwright viewport matrix verifies the result.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest (unit, real PG/Redis via testcontainers), Playwright (e2e). Design spec: `docs/superpowers/specs/2026-06-02-responsive-app-design.md`.

**Verification model:** Modules with real logic (`nav.ts` selectors) get vitest TDD (red → green). Pure styling/markup changes are verified by `pnpm --filter @tt/web typecheck` plus the **Playwright responsive matrix** (Phase 5) — the repo has no component-render unit harness, so presentational components are not unit-tested. **Commit after every task.**

**Branch:** `feat/responsive-app` (already created; the design spec is committed there).

**Conventions to respect (from `docs/constitution.md` / CLAUDE.md):** Czech UI (reuse existing strings; the shell components `CompanySwitcher`/`LogoutButton`/`ThemeToggle` already hardcode Czech chrome strings — the new shell components match that precedent). Dark-mode pairing per the `globals.css` convention comment. No `console.log` in `apps/`/`packages/`. Pre-commit hook blocks `.only`/`.skip`.

---

## Phase 1 — Foundation

### Task 1: Viewport meta, safe-area, global CSS tokens + z-index scale

**Files:**

- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add the `viewport` export to the root layout**

In `apps/web/src/app/layout.tsx`, add the `Viewport` type import. Current first two lines:

```ts
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
```

become:

```ts
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { cookies } from 'next/headers';
```

Then, immediately after the existing `export const metadata = { ... };` block (ends at the line with `};` before `const FOUC_SCRIPT`), add:

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // enables env(safe-area-inset-*) on notched phones
};
```

- [ ] **Step 2: Add CSS tokens, the z-index scale comment, and the overflow guard**

In `apps/web/src/app/globals.css`, immediately after the three `@tailwind` lines (after line 3), insert:

```css
/*
 * Z-INDEX SCALE — single source of truth (mirror of docs/architecture/mobile-layout.md):
 *   z-10  desktop sticky sidebar
 *   z-20  in-page sticky headers (table thead, day-group headers)
 *   z-30  mobile bottom tab bar + mobile top header
 *   z-40  open custom popovers (MultiSelect)
 *   z-50  modals + the mobile More sheet (backdrop & panel)
 */
:root {
  --tab-bar-height: 3.5rem; /* 56px — mobile bottom tab bar */
}

/* Long unbreakable tokens (otpauth URIs, chrome.storage.local) must never cause
   horizontal overflow on phones. */
code,
pre {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "feat(responsive): viewport meta, safe-area, z-index scale + css tokens"
```

---

## Phase 2 — Shell navigation (bottom tab bar + More sheet)

### Task 2: `nav.ts` — icon model + bottom-bar selectors (TDD)

**Files:**

- Modify: `apps/web/src/app/(authenticated)/nav.ts`
- Modify (test): `apps/web/src/app/(authenticated)/nav.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/app/(authenticated)/nav.test.ts`, replace the existing import line

```ts
import { filterVisibleGroups, navGroups, type NavGroup } from './nav.js';
```

with

```ts
import {
  filterVisibleGroups,
  navGroups,
  getBottomTabs,
  getMoreGroups,
  type NavGroup,
} from './nav.js';
```

and append these blocks at the end of the file:

```ts
describe('getBottomTabs', () => {
  it('returns the first 4 visible items in BOTTOM_BAR_ORDER for admin', () => {
    expect(getBottomTabs(true).map((i) => i.href)).toEqual([
      '/timer',
      '/reports',
      '/clients',
      '/members',
    ]);
  });

  it('returns the first 4 visible items for non-admin (admin items filtered out)', () => {
    expect(getBottomTabs(false).map((i) => i.href)).toEqual([
      '/timer',
      '/tags',
      '/settings',
      '/companies',
    ]);
  });

  it('every bottom tab carries an icon', () => {
    expect(getBottomTabs(true).every((i) => typeof i.icon === 'string' && i.icon.length > 0)).toBe(
      true,
    );
  });
});

describe('getMoreGroups', () => {
  it('excludes the 4 primary tabs for admin and keeps the rest', () => {
    const hrefs = getMoreGroups(true).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain('/timer');
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/audit');
    expect(hrefs).toContain('/settings');
  });

  it('for non-admin leaves only the Účet→Rozšíření overflow', () => {
    expect(getMoreGroups(false).flatMap((g) => g.items.map((i) => i.href))).toEqual(['/extension']);
  });

  it('drops groups left empty after removing primary items', () => {
    expect(getMoreGroups(false).every((g) => g.items.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `pnpm --filter @tt/web test -- nav.test`
Expected: FAIL (`getBottomTabs`/`getMoreGroups` not exported)

- [ ] **Step 3: Implement `nav.ts`**

Replace the entire contents of `apps/web/src/app/(authenticated)/nav.ts` with:

```ts
export type NavIcon =
  | 'timer'
  | 'reports'
  | 'clients'
  | 'members'
  | 'tags'
  | 'dashboard'
  | 'settings'
  | 'companies'
  | 'audit'
  | 'trash'
  | 'extension';

export type NavItem = { href: string; label: string; admin?: boolean; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  { label: 'Sledování', items: [{ href: '/timer', label: 'Stopky', icon: 'timer' }] },
  {
    label: 'Přehledy',
    items: [
      { href: '/dashboard', label: 'Dashboard', admin: true, icon: 'dashboard' },
      { href: '/reports', label: 'Reporty', admin: true, icon: 'reports' },
    ],
  },
  {
    label: 'Správa dat',
    items: [
      { href: '/clients', label: 'Klienti', admin: true, icon: 'clients' },
      { href: '/tags', label: 'Štítky', icon: 'tags' },
      { href: '/members', label: 'Členové', admin: true, icon: 'members' },
    ],
  },
  {
    label: 'Systém',
    items: [
      { href: '/audit', label: 'Audit', admin: true, icon: 'audit' },
      { href: '/trash', label: 'Koš', admin: true, icon: 'trash' },
    ],
  },
  {
    label: 'Účet',
    items: [
      { href: '/extension', label: 'Rozšíření', icon: 'extension' },
      { href: '/settings', label: 'Nastavení', icon: 'settings' },
      { href: '/companies', label: 'Firmy', icon: 'companies' },
    ],
  },
];

export function filterVisibleGroups(groups: NavGroup[], isAdmin: boolean): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.admin || isAdmin),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Priority order for the mobile bottom tab bar (highest first). The bar shows
 * the first 4 *visible* (role-filtered) items; the rest fall into the More sheet.
 */
export const BOTTOM_BAR_ORDER: string[] = [
  '/timer',
  '/reports',
  '/clients',
  '/members',
  '/tags',
  '/dashboard',
  '/settings',
  '/companies',
  '/audit',
  '/trash',
  '/extension',
];

export function getBottomTabs(isAdmin: boolean): NavItem[] {
  const visible = filterVisibleGroups(navGroups, isAdmin).flatMap((g) => g.items);
  const byHref = new Map(visible.map((i) => [i.href, i]));
  return BOTTOM_BAR_ORDER.map((href) => byHref.get(href))
    .filter((i): i is NavItem => Boolean(i))
    .slice(0, 4);
}

export function getMoreGroups(isAdmin: boolean): NavGroup[] {
  const primary = new Set(getBottomTabs(isAdmin).map((i) => i.href));
  return filterVisibleGroups(navGroups, isAdmin)
    .map((group) => ({ ...group, items: group.items.filter((i) => !primary.has(i.href)) }))
    .filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm --filter @tt/web test -- nav.test`
Expected: PASS (the existing "11 items"/order/`filterVisibleGroups` tests still pass — labels & hrefs are unchanged; only the `icon` field is added)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(authenticated)/nav.ts" "apps/web/src/app/(authenticated)/nav.test.ts"
git commit -m "feat(responsive): nav icon model + getBottomTabs/getMoreGroups selectors"
```

### Task 3: `nav-icons.tsx` — inline SVG glyph registry

**Files:**

- Create: `apps/web/src/components/nav-icons.tsx`

- [ ] **Step 1: Create the glyph component** (inline SVGs — no icon-library dependency, matching the app's existing hand-rolled icons in `ThemeToggle`/`search-input`):

```tsx
import type { ReactElement } from 'react';

export type GlyphName =
  | 'timer'
  | 'reports'
  | 'clients'
  | 'members'
  | 'tags'
  | 'dashboard'
  | 'settings'
  | 'companies'
  | 'audit'
  | 'trash'
  | 'extension'
  | 'more'
  | 'close';

const PATHS: Record<GlyphName, ReactElement> = {
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>
  ),
  reports: <path d="M4 20V10M10 20V4M16 20v-7M2 20h20" />,
  clients: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" />
    </>
  ),
  tags: (
    <>
      <path d="M3 3h7l11 11-7 7L3 10V3z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  companies: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </>
  ),
  audit: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  trash: <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  extension: (
    <path d="M9 3a2 2 0 0 1 4 0v2h4v4h2a2 2 0 0 1 0 4h-2v4H9v-2a2 2 0 0 0-4 0v2H3v-6h2a2 2 0 0 0 0-4H3V5h6V3z" />
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function NavGlyph({
  icon,
  className,
}: {
  icon: GlyphName;
  className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[icon]}
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter @tt/web typecheck` — Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nav-icons.tsx
git commit -m "feat(responsive): inline SVG nav glyph registry"
```

### Task 4: `MoreSheet.tsx` — overflow nav sheet

**Files:**

- Create: `apps/web/src/app/(authenticated)/MoreSheet.tsx`

- [ ] **Step 1: Create the component** (sheet with profile, company switcher, overflow nav, theme toggle, logout):

```tsx
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
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter @tt/web typecheck` — Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(authenticated)/MoreSheet.tsx"
git commit -m "feat(responsive): MoreSheet overflow nav sheet (profile, company switch, theme, logout)"
```

### Task 5: `BottomTabBar.tsx` — fixed mobile tab bar

**Files:**

- Create: `apps/web/src/app/(authenticated)/BottomTabBar.tsx`

- [ ] **Step 1: Create the component:**

```tsx
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
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter @tt/web typecheck` — Expected: PASS
- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(authenticated)/BottomTabBar.tsx"
git commit -m "feat(responsive): fixed mobile bottom tab bar"
```

### Task 6: Wire the mobile nav into the authenticated layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

- [ ] **Step 1: Import `BottomTabBar`** — after the existing `import { AuthShell } from './AuthShell';` line, add:

```ts
import { BottomTabBar } from './BottomTabBar';
```

- [ ] **Step 2: Compute the role label** — after the existing line `const isAdmin = session.activeRole === 'admin';`, add:

```ts
const roleLabel = isAdmin ? 'Správce' : 'Člen';
```

- [ ] **Step 3: Replace the dead mobile header** — current block (logo **and** logout):

```tsx
<header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6 md:hidden dark:border-zinc-700 dark:bg-zinc-800">
  <Link href="/timer" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
    Time Tracker
  </Link>
  <LogoutButton />
</header>
```

becomes (logo only, sticky, safe-area top, `z-30`; logout now lives in the More sheet):

```tsx
<header className="sticky top-0 z-30 flex h-16 items-center border-b border-zinc-200 bg-white px-4 pt-[env(safe-area-inset-top)] md:hidden dark:border-zinc-700 dark:bg-zinc-800">
  <Link href="/timer" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
    Time Tracker
  </Link>
</header>
```

(`LogoutButton` is still imported — it remains in the desktop sidebar footer — so leave the import in place.)

- [ ] **Step 4: Give `<main>` mobile padding + bottom-bar clearance** — current:

```tsx
        <main className="flex-1 px-6 py-8">
```

becomes:

```tsx
        <main className="flex-1 px-4 py-6 pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] sm:px-6 sm:py-8 md:pb-8">
```

- [ ] **Step 5: Mount the bottom tab bar** — immediately before the final closing `</div>` of the component (the one that closes `<div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-900">`), add:

```tsx
<BottomTabBar
  isAdmin={isAdmin}
  fullName={session.fullName}
  email={session.email}
  roleLabel={roleLabel}
  activeCompanyId={session.activeCompanyId}
  memberships={session.memberships}
/>
```

- [ ] **Step 6: Add a focus ring to sidebar nav links (a11y)** — in the sidebar `<Link>` (the desktop nav item), current className:

```tsx
className =
  'block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100';
```

add focus-visible styling:

```tsx
className =
  'block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100';
```

- [ ] **Step 7: Typecheck** — Run: `pnpm --filter @tt/web typecheck` — Expected: PASS

- [ ] **Step 8: Manual smoke (dev server)** — Run `pnpm --filter @tt/web dev`, open the app at a 360px viewport (DevTools device toolbar). Expected: bottom tab bar visible with 4 tabs + Více; tapping Více opens the sheet with company switcher + remaining nav + theme + logout; sidebar hidden; content not hidden behind the bar.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/(authenticated)/layout.tsx"
git commit -m "feat(responsive): mount mobile bottom nav, slim mobile header, main bottom-bar clearance"
```

---

## Phase 3 — Shared primitives

> These edits change shared components, so they ripple across many pages. Verify each with typecheck; visual correctness is confirmed by the Phase 5 matrix.

### Task 7: `Button` — allow shrinking/wrapping in tight rows

**Files:** Modify: `packages/ui/src/button.tsx`

- [ ] **Step 1:** In the `cn(...)` base classes, current first line:

```ts
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors',
```

becomes (remove `shrink-0`):

```ts
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors',
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter @tt/ui typecheck` (or `pnpm typecheck`) — Expected: PASS
- [ ] **Step 3: Commit** — `git add packages/ui/src/button.tsx && git commit -m "fix(ui): drop button shrink-0 so it can wrap/shrink in narrow rows"`

### Task 8: `ConfirmModal` — fit phones, stack footer buttons

**Files:** Modify: `packages/ui/src/confirm-modal.tsx`

- [ ] **Step 1: Backdrop padding** — current:

```tsx
className =
  'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4 dark:bg-black/60';
```

becomes:

```tsx
className =
  'fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-3 sm:px-4 dark:bg-black/60';
```

- [ ] **Step 2: Panel — cap height + scroll** — current:

```tsx
          'w-full max-w-md overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800',
```

becomes:

```tsx
          'max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800',
```

- [ ] **Step 3: Footer — stack on phones** — current footer wrapper:

```tsx
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3 dark:border-zinc-700/60 dark:bg-zinc-900/40">
```

becomes:

```tsx
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-end dark:border-zinc-700/60 dark:bg-zinc-900/40">
```

- [ ] **Step 4: Footer buttons full-width on mobile** — add `className="w-full sm:w-auto"` to BOTH footer `<Button>`s. The cancel button:

```tsx
<Button
  autoFocus
  type="button"
  size="sm"
  variant="secondary"
  onClick={onCancel}
  disabled={loading}
  className="w-full sm:w-auto"
>
  {cancelLabel}
</Button>
```

and the confirm button:

```tsx
<Button
  type="button"
  size="sm"
  variant={tone === 'danger' ? 'danger' : 'primary'}
  loading={loading}
  onClick={onConfirm}
  className="w-full sm:w-auto"
>
  {confirmLabel}
</Button>
```

- [ ] **Step 5: Typecheck** — Run: `pnpm typecheck` — Expected: PASS
- [ ] **Step 6: Commit** — `git add packages/ui/src/confirm-modal.tsx && git commit -m "fix(ui): ConfirmModal fits phones, stacks footer buttons"`

### Task 9: `Card` — responsive padding, stacking header/footer

**Files:** Modify: `packages/ui/src/card.tsx`

- [ ] **Step 1: CardHeader** — current:

```ts
        'flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-700/60',
```

becomes:

```ts
        'flex flex-col items-start gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4 dark:border-zinc-700/60',
```

- [ ] **Step 2: CardBody** — current:

```ts
  return <div {...props} className={cn('px-5 py-4', props.className)} />;
```

becomes:

```ts
  return <div {...props} className={cn('px-4 py-3 sm:px-5 sm:py-4', props.className)} />;
```

- [ ] **Step 3: CardFooter** — current:

```ts
        'flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3 dark:border-zinc-700/60 dark:bg-zinc-900/40',
```

becomes:

```ts
        'flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 dark:border-zinc-700/60 dark:bg-zinc-900/40',
```

- [ ] **Step 4: Typecheck** — Run: `pnpm typecheck` — Expected: PASS
- [ ] **Step 5: Commit** — `git add packages/ui/src/card.tsx && git commit -m "fix(ui): responsive Card padding + stacking header/footer"`

### Task 10: `SearchInput` — larger clear-button tap target

**Files:** Modify: `packages/ui/src/search-input.tsx`

- [ ] **Step 1: Input right padding** — in `inputBase`, current fragment `pl-9 pr-9 py-2` becomes `pl-9 pr-10 py-2`.
- [ ] **Step 2: Clear button size** — current:

```tsx
className =
  'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-700';
```

becomes (`h-6 w-6` → `h-9 w-9`):

```tsx
className =
  'absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-700';
```

- [ ] **Step 3: Typecheck** — Run: `pnpm typecheck` — Expected: PASS
- [ ] **Step 4: Commit** — `git add packages/ui/src/search-input.tsx && git commit -m "fix(ui): larger SearchInput clear-button tap target"`

### Task 11: `EmptyState` — responsive padding

**Files:** Modify: `packages/ui/src/empty-state.tsx`

- [ ] **Step 1:** current `px-6 py-12` (in the outer div) becomes `px-4 py-8 sm:px-6 sm:py-12`. Full current line:

```tsx
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 px-6 py-12 text-center dark:border-zinc-600 dark:bg-zinc-800/40">
```

becomes:

```tsx
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 px-4 py-8 text-center sm:px-6 sm:py-12 dark:border-zinc-600 dark:bg-zinc-800/40">
```

- [ ] **Step 2: Typecheck + Commit** — `pnpm typecheck`; `git add packages/ui/src/empty-state.tsx && git commit -m "fix(ui): responsive EmptyState padding"`

### Task 12: `MultiSelect` — popover above the bottom bar, viewport-bounded list

**Files:** Modify: `apps/web/src/components/MultiSelect.tsx`

- [ ] **Step 1: Popover z-index** — current:

```tsx
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg">
```

becomes (`z-20` → `z-40`, so it sits above the `z-30` bottom bar):

```tsx
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg">
```

- [ ] **Step 2: Option list max-height** — current:

```tsx
          <ul className="max-h-64 overflow-y-auto py-1">
```

becomes (never taller than the viewport on short phones):

```tsx
          <ul className="max-h-[min(16rem,60vh)] overflow-y-auto py-1">
```

- [ ] **Step 3: Wrap long option labels** — current:

```tsx
<span className="text-zinc-900 dark:text-zinc-100">{o.label}</span>
```

becomes:

```tsx
<span className="break-words text-zinc-900 dark:text-zinc-100">{o.label}</span>
```

- [ ] **Step 4: Typecheck + Commit** — `pnpm --filter @tt/web typecheck`; `git add apps/web/src/components/MultiSelect.tsx && git commit -m "fix(responsive): MultiSelect popover z-index + viewport-bounded list"`

### Task 13: `PageHeader` — responsive title + stacking

**Files:** Modify: `apps/web/src/components/PageHeader.tsx`

- [ ] **Step 1: Container** — current:

```tsx
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
```

becomes:

```tsx
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
```

- [ ] **Step 2: Title size** — current:

```tsx
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
```

becomes:

```tsx
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl text-zinc-900 dark:text-zinc-100">
```

- [ ] **Step 3: Typecheck + Commit** — `pnpm --filter @tt/web typecheck`; `git add apps/web/src/components/PageHeader.tsx && git commit -m "fix(responsive): PageHeader stacks + scales title on mobile"`

### Task 14: `DataCard` primitive — the table→card building block

**Files:**

- Create: `packages/ui/src/data-cards.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the primitive:**

```tsx
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

/** Bordered card used as the mobile (below-md) stand-in for a table row. */
export function DataCard(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800',
        props.className,
      )}
    />
  );
}

/** A label–value line inside a DataCard. */
export function DataCardRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-zinc-800 dark:text-zinc-200">
        {children}
      </span>
    </div>
  );
}

/** Footer row for the card's action buttons. */
export function DataCardActions(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-700/60',
        props.className,
      )}
    />
  );
}
```

- [ ] **Step 2: Export it** — in `packages/ui/src/index.ts`, after the `export { SearchInput, ... }` line add:

```ts
export { DataCard, DataCardRow, DataCardActions } from './data-cards.js';
```

- [ ] **Step 3: Typecheck + Commit** — `pnpm typecheck`; `git add packages/ui/src/data-cards.tsx packages/ui/src/index.ts && git commit -m "feat(ui): DataCard primitive for table→card mobile layouts"`

### Task 15: `AuthPageShell` — shared centered wrapper for public/auth pages

**Files:**

- Create: `apps/web/src/components/AuthPageShell.tsx`

- [ ] **Step 1: Create the wrapper** (kills the repeated `py-12` centering block; used by Phase 4 public/auth tasks):

```tsx
import type { ReactElement, ReactNode } from 'react';

/** Centered, responsively-padded wrapper for public/auth pages. */
export function AuthPageShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-4 sm:py-8 md:py-12 dark:bg-zinc-900">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

> NOTE for Phase 4: confirm against the current login page wrapper before swapping — if a page's existing wrapper differs (e.g. a different `max-w-*` or background), keep its specifics and only adopt the responsive `py-4 sm:py-8 md:py-12`. The public/auth task quotes each page's exact current wrapper.

- [ ] **Step 2: Typecheck + Commit** — `pnpm --filter @tt/web typecheck`; `git add apps/web/src/components/AuthPageShell.tsx && git commit -m "feat(responsive): shared AuthPageShell wrapper"`

### Task 16: `Table` primitive — scroll instead of clip on mobile (safety net)

**Files:** Modify: `packages/ui/src/table.tsx`

This backs up the table→card pattern: any `<Table>` that is _not_ converted to cards (or is wide on a tablet) scrolls horizontally instead of clipping. Converted tables live inside `hidden md:block`, so on mobile they're not rendered and this only matters at `md+`.

- [ ] **Step 1:** The wrapper currently clips overflow. Current (`packages/ui/src/table.tsx` line 6):

```tsx
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
```

becomes:

```tsx
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white md:overflow-hidden dark:border-zinc-700 dark:bg-zinc-800">
```

- [ ] **Step 2: Typecheck** — Run: `pnpm typecheck` — Expected: PASS
- [ ] **Step 3: Commit** — `git add packages/ui/src/table.tsx && git commit -m "fix(ui): Table scrolls instead of clipping on mobile"`

## Phase 4 — Per-page responsive sweep

Each sub-section below is a self-contained set of tasks with **exact before/after edits drafted against the real files**. Implement areas in any order; **commit after each task**. Rules that apply throughout (the drafts already follow them — keep them in mind while applying):

- **Table → cards:** the shared `<Table>` primitive renders its own bordered wrapper `<div>`, so the desktop table is wrapped in `<div className="hidden md:block"><Table>…</Table></div>` (do **not** put `hidden` on `<Table>` itself), with a sibling `<ul className="space-y-3 md:hidden">` of cards. Cards use `DataCard` / `DataCardRow` / `DataCardActions` from `@tt/ui` (created in Phase 3, Task 14); a couple of tasks build equivalent inline cards where columns are conditional — both are acceptable.
- **Reuse existing strings** for card field labels (the column headers already present in the file). No new i18n keys.
- After each task, run `pnpm --filter @tt/web typecheck`; after Phase 5 exists, also run the responsive matrix for the touched routes.
- Line numbers in the drafts were accurate at drafting time — if a file has shifted, **match on the quoted code, not the line number**.
- Prettier runs on commit (lint-staged); don't hand-fight indentation, but keep JSX valid.

The depth/breakpoint conventions (single `md` switch, `w-full sm:w-auto` for lone form buttons, `h-10 w-10 sm:h-8 sm:w-8` for mobile icon buttons, `z-40` for the `MultiSelect` popover) are baked into the edits below.

---

### Phase 4.1 — Timer (Stopky)

### Task 1: Timer page spacing

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/page.tsx`

- [ ] **Step 1: Update page spacing**

Current:

```tsx
      <div className="space-y-6">
```

New:

```tsx
      <div className="space-y-4 md:space-y-6">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 2: TimerStartCard form grids and button layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx`

- [ ] **Step 1: Update manual entry form grid (date/time fields)**

Current:

```tsx
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
```

New:

```tsx
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
```

- [ ] **Step 2: Update picker row grid**

Current:

```tsx
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
```

New:

```tsx
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2">
```

- [ ] **Step 3: Update submit button layout (manual entry form)**

Current:

```tsx
              <div className="mt-4 flex justify-end">
                <Button type="submit" loading={pending}>
```

New:

```tsx
              <div className="mt-4 flex w-full sm:w-auto justify-end">
                <Button type="submit" loading={pending} className="w-full sm:w-auto">
```

- [ ] **Step 4: Update submit button layout (quick start form)**

Current:

```tsx
              <div className="mt-4 flex justify-end">
                <Button type="submit" size="lg" loading={pending}>
```

New:

```tsx
              <div className="mt-4 flex w-full sm:w-auto justify-end">
                <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
```

- [ ] **Step 5: Update tag pill padding**

Current:

```tsx
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
```

New:

```tsx
              className={`rounded-full border px-2.5 py-1 sm:py-0.5 text-xs font-medium transition-colors ${
```

- [ ] **Step 6: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 3: RunningTimers row layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`

- [ ] **Step 1: Update running row container**

Current:

```tsx
      <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-100 dark:border-zinc-700/60 px-3 py-2">
```

New:

```tsx
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between gap-4 rounded-md border border-zinc-100 dark:border-zinc-700/60 px-3 py-2">
```

- [ ] **Step 2: Update action buttons container and add responsive sizing**

Current (line 131-148):

```tsx
<div className="flex shrink-0 items-center gap-3">
  <span
    suppressHydrationWarning
    className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
  >
    {formatDurationHMS(elapsed)}
  </span>
  <EditEntryButton
    entryId={entry.id}
    startedAt={entry.startedAt}
    endedAt={null}
    autoStackOverlaps={autoStackOverlaps}
    onSaved={() => notifyTimerChanged()}
  />
  <Button variant="danger" size="sm" loading={pending} onClick={() => void handleStop()}>
    ■ Stop
  </Button>
</div>
```

New:

```tsx
<div className="flex shrink-0 w-full sm:w-auto items-center gap-3">
  <span
    suppressHydrationWarning
    className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
  >
    {formatDurationHMS(elapsed)}
  </span>
  <EditEntryButton
    entryId={entry.id}
    startedAt={entry.startedAt}
    endedAt={null}
    autoStackOverlaps={autoStackOverlaps}
    onSaved={() => notifyTimerChanged()}
    className="h-10 w-10 sm:h-8 sm:w-8"
  />
  <Button
    variant="danger"
    size="sm"
    loading={pending}
    onClick={() => void handleStop()}
    className="h-10 w-10 sm:h-8 sm:w-8"
  >
    ■ Stop
  </Button>
</div>
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 4: TimerHistory row layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx`

- [ ] **Step 1: Update history row container**

Current:

```tsx
    <li className="flex items-center justify-between gap-4 py-2.5">
```

New:

```tsx
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between gap-4 py-2.5">
```

- [ ] **Step 2: Update action buttons container and add responsive sizing**

Current (line 142-176):

```tsx
<div className="flex shrink-0 items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
  <span className="font-mono tabular-nums">
    {fmtTime(startedAt)}–{fmtTime(endedAt)}
  </span>
  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
    {fmtDur(endedAt.getTime() - startedAt.getTime())}
  </span>
  <EditEntryButton
    entryId={entry.id}
    startedAt={entry.startedAt}
    endedAt={entry.endedAt}
    autoStackOverlaps={autoStackOverlaps}
    onSaved={() => notifyTimerChanged()}
  />
  <Button
    size="sm"
    variant="ghost"
    loading={playPending}
    disabled={deletePending}
    onClick={() => void runPlayAgain()}
    title="Spustit znovu"
  >
    ▶
  </Button>
  <Button
    size="sm"
    variant="ghost"
    loading={deletePending}
    disabled={playPending}
    onClick={() => void runDelete()}
    title="Smazat"
  >
    ✕
  </Button>
</div>
```

New:

```tsx
<div className="flex shrink-0 w-full sm:w-auto items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
  <span className="font-mono tabular-nums">
    {fmtTime(startedAt)}–{fmtTime(endedAt)}
  </span>
  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
    {fmtDur(endedAt.getTime() - startedAt.getTime())}
  </span>
  <EditEntryButton
    entryId={entry.id}
    startedAt={entry.startedAt}
    endedAt={entry.endedAt}
    autoStackOverlaps={autoStackOverlaps}
    onSaved={() => notifyTimerChanged()}
    className="h-10 w-10 sm:h-8 sm:w-8"
  />
  <Button
    size="sm"
    variant="ghost"
    loading={playPending}
    disabled={deletePending}
    onClick={() => void runPlayAgain()}
    title="Spustit znovu"
    className="h-10 w-10 sm:h-8 sm:w-8"
  >
    ▶
  </Button>
  <Button
    size="sm"
    variant="ghost"
    loading={deletePending}
    disabled={playPending}
    onClick={() => void runDelete()}
    title="Smazat"
    className="h-10 w-10 sm:h-8 sm:w-8"
  >
    ✕
  </Button>
</div>
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 5: EditEntryDialog spacing

**Files:**

- Modify: `apps/web/src/components/time/EditEntryDialog.tsx`

- [ ] **Step 1: Update dialog content spacing**

Current:

```tsx
        <div className="space-y-4">
```

New:

```tsx
        <div className="space-y-3 md:space-y-4">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 6: AutoStackPreviewDialog responsive improvements

**Files:**

- Modify: `apps/web/src/components/time/AutoStackPreviewDialog.tsx`

- [ ] **Step 1: Update direction toggle buttons for larger tap target**

Current:

```tsx
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          className={`rounded px-3 py-1 text-sm ${
            direction === 'forward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('forward')}
          disabled={pending}
        >
          {t('directionForward')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'backward'}
          className={`rounded px-3 py-1 text-sm ${
            direction === 'backward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('backward')}
          disabled={pending}
        >
          {t('directionBackward')}
        </button>
```

New:

```tsx
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          className={`rounded px-3 py-2 sm:py-1 text-sm ${
            direction === 'forward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('forward')}
          disabled={pending}
        >
          {t('directionForward')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'backward'}
          className={`rounded px-3 py-2 sm:py-1 text-sm ${
            direction === 'backward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('backward')}
          disabled={pending}
        >
          {t('directionBackward')}
        </button>
```

- [ ] **Step 2: Update code block text size for responsive overflow handling**

Current:

```tsx
          <li className="font-medium">
            {t('candidateRowLabel')}{' '}
            <code className="text-xs font-normal">
              {formatRange(candidate.startedAt, candidate.endedAt)} →{' '}
              {formatRange(plan.candidateAfter.startedAt, plan.candidateAfter.endedAt)}
            </code>
          </li>
          {plan.shifts.map((s, i) => (
            <li key={i} className="text-zinc-600 dark:text-zinc-400">
              <code className="text-xs">
```

New:

```tsx
          <li className="font-medium">
            {t('candidateRowLabel')}{' '}
            <code className="text-[10px] sm:text-xs font-normal overflow-x-auto block">
              {formatRange(candidate.startedAt, candidate.endedAt)} →{' '}
              {formatRange(plan.candidateAfter.startedAt, plan.candidateAfter.endedAt)}
            </code>
          </li>
          {plan.shifts.map((s, i) => (
            <li key={i} className="text-zinc-600 dark:text-zinc-400">
              <code className="text-[10px] sm:text-xs overflow-x-auto block">
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Phase 4.2 — Reports + Dashboard

## Responsive Mobile Breakpoint Fixes — Reports + Dashboard Area

### Task 1: ReportGrouped — Convert table to DataCard mobile pattern

**Files:**

- Modify: `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx`

- [ ] **Step 1: Import DataCard components (or inline card primitives)**

Since DataCard components (DataCard, DataCardRow, DataCardActions) are marked for Phase 3, I'll use inline card styling with the shared primitives. Update the imports to include what we need:

Current:

```tsx
import type { ReactElement } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  Th,
  Tr,
  Td,
  EmptyState,
} from '@tt/ui';
```

New:

```tsx
import type { ReactElement } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  Th,
  Tr,
  Td,
  EmptyState,
} from '@tt/ui';
```

(No change needed; we'll build card rows inline with div+Tailwind classes.)

- [ ] **Step 2: Wrap the table in `hidden md:table` and add mobile card list**

Current (lines 47–102):

```tsx
<CardBody>
  <Table>
    <THead>
      <tr>
        <Th>Datum</Th>
        {showUser ? <Th>Uživatel</Th> : null}
        {showClientProject ? <Th>Klient</Th> : null}
        {showClientProject ? <Th>Projekt</Th> : null}
        <Th>Popis</Th>
        <Th>Štítky</Th>
        <Th className="text-right">Čas</Th>
        <Th>Akce</Th>
      </tr>
    </THead>
    <tbody>
      {g.rows.map((r) => (
        <Tr key={r.id}>
          <Td className="whitespace-nowrap font-mono text-xs">
            {`${ymd(r.startedAt)} ${fmtTime(r.startedAt)}`}
          </Td>
          {showUser ? <Td>{r.userName}</Td> : null}
          {showClientProject ? (
            <Td className="text-zinc-700 dark:text-zinc-300">{r.clientName ?? '—'}</Td>
          ) : null}
          {showClientProject ? (
            <Td className="text-zinc-700 dark:text-zinc-300">{r.projectName ?? '—'}</Td>
          ) : null}
          <Td className="max-w-xs truncate" title={r.description}>
            {r.description}
          </Td>
          <Td>
            <div className="flex flex-wrap gap-1">
              {r.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </Td>
          <Td className="text-right font-mono">{fmtDur(r.durationMs)}</Td>
          <Td>
            <ReportsRowActions
              entryId={r.id}
              startedAt={r.startedAt.toISOString()}
              endedAt={r.endedAt ? r.endedAt.toISOString() : null}
              autoStackOverlaps={autoStackOverlaps}
            />
          </Td>
        </Tr>
      ))}
    </tbody>
  </Table>
</CardBody>
```

New:

```tsx
<CardBody>
  <div className="hidden md:block">
    <Table>
      <THead>
        <tr>
          <Th>Datum</Th>
          {showUser ? <Th>Uživatel</Th> : null}
          {showClientProject ? <Th>Klient</Th> : null}
          {showClientProject ? <Th>Projekt</Th> : null}
          <Th>Popis</Th>
          <Th>Štítky</Th>
          <Th className="text-right">Čas</Th>
          <Th>Akce</Th>
        </tr>
      </THead>
      <tbody>
        {g.rows.map((r) => (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap font-mono text-xs">
              {`${ymd(r.startedAt)} ${fmtTime(r.startedAt)}`}
            </Td>
            {showUser ? <Td>{r.userName}</Td> : null}
            {showClientProject ? (
              <Td className="text-zinc-700 dark:text-zinc-300">{r.clientName ?? '—'}</Td>
            ) : null}
            {showClientProject ? (
              <Td className="text-zinc-700 dark:text-zinc-300">{r.projectName ?? '—'}</Td>
            ) : null}
            <Td className="max-w-xs truncate" title={r.description}>
              {r.description}
            </Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {r.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </Td>
            <Td className="text-right font-mono">{fmtDur(r.durationMs)}</Td>
            <Td>
              <ReportsRowActions
                entryId={r.id}
                startedAt={r.startedAt.toISOString()}
                endedAt={r.endedAt ? r.endedAt.toISOString() : null}
                autoStackOverlaps={autoStackOverlaps}
              />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  </div>
  <ul className="space-y-3 md:hidden">
    {g.rows.map((r) => (
      <li
        key={r.id}
        className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800"
      >
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Datum
            </span>
            <span className="font-mono text-xs">
              {`${ymd(r.startedAt)} ${fmtTime(r.startedAt)}`}
            </span>
          </div>
          {showUser ? (
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Uživatel
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">{r.userName}</span>
            </div>
          ) : null}
          {showClientProject ? (
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Klient
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">{r.clientName ?? '—'}</span>
            </div>
          ) : null}
          {showClientProject ? (
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Projekt
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">{r.projectName ?? '—'}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Popis
            </span>
            <span className="text-zinc-900 dark:text-zinc-100 text-right">{r.description}</span>
          </div>
          {r.tags.length > 0 ? (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 block mb-1">
                Štítky
              </span>
              <div className="flex flex-wrap gap-1">
                {r.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Čas
            </span>
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {fmtDur(r.durationMs)}
            </span>
          </div>
        </div>
        <div className="mt-3 border-t border-zinc-100 dark:border-zinc-700 pt-2">
          <ReportsRowActions
            entryId={r.id}
            startedAt={r.startedAt.toISOString()}
            endedAt={r.endedAt ? r.endedAt.toISOString() : null}
            autoStackOverlaps={autoStackOverlaps}
          />
        </div>
      </li>
    ))}
  </ul>
</CardBody>
```

- [ ] **Step 3: Update grand-total footer to flex-col sm:flex-row**

Current (lines 106–111):

```tsx
<div className="flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{labels.grandTotal}:</span>
  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
    {fmtDur(report.grandTotalMs)}
  </span>
</div>
```

New:

```tsx
<div className="flex flex-col sm:flex-row sm:justify-end gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{labels.grandTotal}:</span>
  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
    {fmtDur(report.grandTotalMs)}
  </span>
</div>
```

- [ ] **Step 4: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 2: reports/page — Fix export button row layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/reports/page.tsx`

- [ ] **Step 1: Change export actions flex-wrap to flex-col sm:flex-row with full-width buttons**

Current (lines 98–118):

```tsx
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/reports/export.pdf?preset=lastMonth&groupBy=project"
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('export.lastMonth')}
            </a>
            <a
              href={`/api/reports/export.csv?${exportQS.toString()}`}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('export.csv')}
            </a>
            <a
              href={`/api/reports/export.pdf?${exportQS.toString()}`}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
            >
              {t('export.pdf')}
            </a>
          </div>
        }
```

New:

```tsx
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <a
              href="/api/reports/export.pdf?preset=lastMonth&groupBy=project"
              className="w-full sm:w-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-center"
            >
              {t('export.lastMonth')}
            </a>
            <a
              href={`/api/reports/export.csv?${exportQS.toString()}`}
              className="w-full sm:w-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-center"
            >
              {t('export.csv')}
            </a>
            <a
              href={`/api/reports/export.pdf?${exportQS.toString()}`}
              className="w-full sm:w-auto rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-center"
            >
              {t('export.pdf')}
            </a>
          </div>
        }
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 3: ReportFiltersForm — Responsive filter layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx`

- [ ] **Step 1: Fix date-preset buttons and custom-range layout**

Current (lines 131–175):

```tsx
<div className="space-y-2">
  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
    Období
  </p>
  <div className="flex flex-wrap items-center gap-2">
    {PRESETS.map((p) => {
      const active = activePreset === p.label;
      return (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            const r = preset(p.key);
            setFrom(r.from);
            setTo(r.to);
          }}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            active
              ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
          }`}
        >
          {p.label}
        </button>
      );
    })}
    <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">nebo vlastní:</span>
    <input
      type="date"
      name="from"
      value={from}
      onChange={(e) => setFrom(e.target.value)}
      className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none"
    />
    <span className="text-zinc-400 dark:text-zinc-500">–</span>
    <input
      type="date"
      name="to"
      value={to}
      onChange={(e) => setTo(e.target.value)}
      className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none"
    />
  </div>
</div>
```

New:

```tsx
<div className="space-y-2">
  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
    Období
  </p>
  <div className="flex flex-wrap gap-2">
    {PRESETS.map((p) => {
      const active = activePreset === p.label;
      return (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            const r = preset(p.key);
            setFrom(r.from);
            setTo(r.to);
          }}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            active
              ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
          }`}
        >
          {p.label}
        </button>
      );
    })}
  </div>
  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
    <span className="text-xs text-zinc-400 dark:text-zinc-500">nebo vlastní:</span>
    <input
      type="date"
      name="from"
      value={from}
      onChange={(e) => setFrom(e.target.value)}
      className="w-full sm:w-auto h-8 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none"
    />
    <span className="hidden sm:inline text-zinc-400 dark:text-zinc-500">–</span>
    <span className="sm:hidden text-zinc-400 dark:text-zinc-500 text-xs">do</span>
    <input
      type="date"
      name="to"
      value={to}
      onChange={(e) => setTo(e.target.value)}
      className="w-full sm:w-auto h-8 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none"
    />
  </div>
</div>
```

- [ ] **Step 2: Fix group-by + "jen moje" row layout**

Current (lines 177–215):

```tsx
<div className="flex flex-wrap items-center gap-4">
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {t('groupBy.label')}
    </p>
    <div className="flex flex-wrap items-center gap-2">
      {GROUP_KEYS.map((key) => {
        const active = groupBy === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setGroupBy(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
            }`}
          >
            {t(`groupBy.${key}`)}
          </button>
        );
      })}
    </div>
    <input type="hidden" name="groupBy" value={groupBy} />
  </div>
  {isAdmin ? (
    <label className="flex items-center gap-2 self-end pb-1 text-sm text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
      {t('onlyMine')}
      {onlyMine ? <input type="hidden" name="member" value={meId} /> : null}
    </label>
  ) : null}
</div>
```

New:

```tsx
<div className="flex flex-col sm:flex-row sm:items-end gap-4">
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {t('groupBy.label')}
    </p>
    <div className="flex flex-wrap gap-2">
      {GROUP_KEYS.map((key) => {
        const active = groupBy === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setGroupBy(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
            }`}
          >
            {t(`groupBy.${key}`)}
          </button>
        );
      })}
    </div>
    <input type="hidden" name="groupBy" value={groupBy} />
  </div>
  {isAdmin ? (
    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
      {t('onlyMine')}
      {onlyMine ? <input type="hidden" name="member" value={meId} /> : null}
    </label>
  ) : null}
</div>
```

- [ ] **Step 3: Fix tags-mode toggle buttons with bigger tap targets**

Current (lines 247–276):

```tsx
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Štítky
            </span>
            <span className="inline-flex overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700 text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setTagsMode('or')}
                className={`px-2 py-0.5 ${
                  tagsMode === 'or'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Aspoň jeden
              </button>
              <button
                type="button"
                onClick={() => setTagsMode('and')}
                className={`px-2 py-0.5 ${
                  tagsMode === 'and'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Všechny
              </button>
            </span>
          </div>
```

New:

```tsx
        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Štítky
            </span>
            <span className="inline-flex overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700 text-xs sm:text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setTagsMode('or')}
                className={`px-3 py-1 sm:px-2 sm:py-0.5 ${
                  tagsMode === 'or'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Aspoň jeden
              </button>
              <button
                type="button"
                onClick={() => setTagsMode('and')}
                className={`px-3 py-1 sm:px-2 sm:py-0.5 ${
                  tagsMode === 'and'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Všechny
              </button>
            </span>
          </div>
```

- [ ] **Step 4: Fix action row (filter buttons) layout**

Current (lines 299–317):

```tsx
<div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
  <p className="text-xs text-zinc-500 dark:text-zinc-400">
    {totalSelected === 0
      ? 'Žádné aktivní filtry — zobrazí se všechny záznamy.'
      : `Aktivních filtrů: ${totalSelected}`}
  </p>
  <div className="flex items-center gap-2">
    {totalSelected > 0 ? (
      <Link
        href="/reports"
        className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
      >
        Vymazat filtry
      </Link>
    ) : null}
    <Button type="submit">Použít filtry</Button>
  </div>
</div>
```

New:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
  <p className="text-xs text-zinc-500 dark:text-zinc-400">
    {totalSelected === 0
      ? 'Žádné aktivní filtry — zobrazí se všechny záznamy.'
      : `Aktivních filtrů: ${totalSelected}`}
  </p>
  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
    {totalSelected > 0 ? (
      <Link
        href="/reports"
        className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-center sm:text-left"
      >
        Vymazat filtry
      </Link>
    ) : null}
    <Button type="submit" className="w-full sm:w-auto">
      Použít filtry
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 4: dashboard — Secondary grid, client-share rows, and daily-breakdown

**Files:**

- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx`

- [ ] **Step 1: Add md:grid-cols-2 to secondary grid**

Current (line 100):

```tsx
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
```

New:

```tsx
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
```

- [ ] **Step 2: Fix client-share label width**

Current (line 151):

```tsx
                      <li key={c.clientId ?? 'none'} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate text-zinc-700 dark:text-zinc-300">
```

New:

```tsx
                      <li key={c.clientId ?? 'none'} className="flex items-center gap-3 text-sm">
                        <span className="w-20 sm:w-32 shrink-0 truncate text-zinc-700 dark:text-zinc-300">
```

- [ ] **Step 3: Wrap daily-breakdown in overflow-x-auto**

Current (line 217–219):

```tsx
<div className="mt-4">
  <DailyBreakdown range={range} buckets={Array.from(dailyByDay.values())} />
</div>
```

New:

```tsx
<div className="mt-4 overflow-x-auto">
  <DailyBreakdown range={range} buckets={Array.from(dailyByDay.values())} />
</div>
```

- [ ] **Step 4: Update DailyBreakdown dense text sizing**

Current (line 384):

```tsx
                      <span
                        className={`tabular-nums ${isDense ? 'text-[9px]' : 'text-[10px]'} ${
```

New:

```tsx
                      <span
                        className={`tabular-nums ${isDense ? 'text-[10px] sm:text-[9px]' : 'text-[10px]'} ${
```

- [ ] **Step 5: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Phase 4.3 — Admin data (members, clients, companies, tags)

## Admin Data Tables & Forms Responsive Design — Phase 5

### Task 1: Members Table → DataCard Mobile Pattern

**Files:**

- Modify: `apps/web/src/app/(authenticated)/members/MembersManager.tsx`

- [ ] **Step 1: Import DataCard components**
      Add to the import block:

  ```
  Current:
  import { Alert, Badge, Button, EmptyState, Table, THead, Th, Tr, Td, useConfirm } from '@tt/ui';

  New:
  import { Alert, Badge, Button, DataCard, DataCardRow, DataCardActions, EmptyState, Table, THead, Th, Tr, Td, useConfirm } from '@tt/ui';
  ```

- [ ] **Step 2: Wrap MembersManager table in hidden md:table and add mobile cards**
      The table (lines 125–199) should be wrapped with `hidden md:table` and a sibling `<ul>` with mobile cards. Replace the entire `<Table>` block with:

  ```
  Current:
      <Table>
        <THead>
          <tr>
            <Th>Jméno</Th>
            <Th>E-mail</Th>
            <Th>Role</Th>
            <Th>Připojen</Th>
            <Th className="text-right">Akce</Th>
          </tr>
        </THead>
        <tbody>
          {memberships.map((m) => (
            <Tr key={m.userId}>
              <Td className="font-medium">{m.fullName}</Td>
              <Td className="text-zinc-600 dark:text-zinc-400">{m.email}</Td>
              <Td>
                <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                  {m.role === 'admin' ? 'Správce' : 'Člen'}
                </Badge>
              </Td>
              <Td className="text-zinc-600 dark:text-zinc-400">
                {new Date(m.joinedAt).toLocaleDateString('cs-CZ')}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    disabled={m.userId === currentUserId && m.role === 'admin'}
                    title={
                      m.userId === currentUserId && m.role === 'admin'
                        ? 'Nemůžete degradovat sami sebe'
                        : undefined
                    }
                    onClick={() =>
                      startTransition(async () => {
                        const r = await changeRoleAction(
                          m.userId,
                          m.role === 'admin' ? 'user' : 'admin',
                        );
                        if (!r.ok) setError(r.error);
                      })
                    }
                  >
                    {m.role === 'admin' ? 'Degradovat' : 'Povýšit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    disabled={m.userId === currentUserId}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: t('removeTitle'),
                          description: t('removeDescription', { name: m.fullName }),
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const r = await removeMemberAction(m.userId);
                          if (!r.ok) setError(r.error);
                        });
                      })();
                    }}
                  >
                    Odebrat
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

  New:
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Jméno</Th>
              <Th>E-mail</Th>
              <Th>Role</Th>
              <Th>Připojen</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {memberships.map((m) => (
              <Tr key={m.userId}>
                <Td className="font-medium">{m.fullName}</Td>
                <Td className="text-zinc-600 dark:text-zinc-400">{m.email}</Td>
                <Td>
                  <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                    {m.role === 'admin' ? 'Správce' : 'Člen'}
                  </Badge>
                </Td>
                <Td className="text-zinc-600 dark:text-zinc-400">
                  {new Date(m.joinedAt).toLocaleDateString('cs-CZ')}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      disabled={m.userId === currentUserId && m.role === 'admin'}
                      title={
                        m.userId === currentUserId && m.role === 'admin'
                          ? 'Nemůžete degradovat sami sebe'
                          : undefined
                      }
                      onClick={() =>
                        startTransition(async () => {
                          const r = await changeRoleAction(
                            m.userId,
                            m.role === 'admin' ? 'user' : 'admin',
                          );
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      {m.role === 'admin' ? 'Degradovat' : 'Povýšit'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      disabled={m.userId === currentUserId}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('removeTitle'),
                            description: t('removeDescription', { name: m.fullName }),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await removeMemberAction(m.userId);
                            if (!r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Odebrat
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {memberships.map((m) => (
          <DataCard key={m.userId}>
            <DataCardRow label="Jméno">{m.fullName}</DataCardRow>
            <DataCardRow label="E-mail">{m.email}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                {m.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Připojen">{new Date(m.joinedAt).toLocaleDateString('cs-CZ')}</DataCardRow>
            <DataCardActions>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  disabled={m.userId === currentUserId && m.role === 'admin'}
                  title={
                    m.userId === currentUserId && m.role === 'admin'
                      ? 'Nemůžete degradovat sami sebe'
                      : undefined
                  }
                  onClick={() =>
                    startTransition(async () => {
                      const r = await changeRoleAction(
                        m.userId,
                        m.role === 'admin' ? 'user' : 'admin',
                      );
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  {m.role === 'admin' ? 'Degradovat' : 'Povýšit'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  disabled={m.userId === currentUserId}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('removeTitle'),
                        description: t('removeDescription', { name: m.fullName }),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await removeMemberAction(m.userId);
                        if (!r.ok) setError(r.error);
                      });
                    })();
                  }}
                >
                  Odebrat
                </Button>
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
  ```

- [ ] **Step 3: Wrap PendingInvites table in hidden md:table and add mobile cards**
      The table (lines 43–102) should be wrapped similarly. Replace the entire `<Table>` block with:

  ```
  Current:
      <Table>
        <THead>
          <tr>
            <Th>E-mail</Th>
            <Th>Role</Th>
            <Th>Vyprší</Th>
            <Th className="text-right">Akce</Th>
          </tr>
        </THead>
        <tbody>
          {invites.map((i) => (
            <Tr key={i.id}>
              <Td>{i.email}</Td>
              <Td>
                <Badge tone={i.role === 'admin' ? 'info' : 'neutral'}>
                  {i.role === 'admin' ? 'Správce' : 'Člen'}
                </Badge>
              </Td>
              <Td>{new Date(i.expiresAt).toLocaleDateString('cs-CZ')}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await resendInviteAction(i.id);
                        if (!r.ok) setError(r.error);
                      })
                    }
                  >
                    Odeslat znovu
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: t('revokeInviteTitle'),
                          description: t('revokeInviteDescription', { email: i.email }),
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const r = await revokeInviteAction(i.id);
                          if (!r.ok) setError(r.error);
                        });
                      })();
                    }}
                  >
                    Zrušit
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

  New:
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>E-mail</Th>
              <Th>Role</Th>
              <Th>Vyprší</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {invites.map((i) => (
              <Tr key={i.id}>
                <Td>{i.email}</Td>
                <Td>
                  <Badge tone={i.role === 'admin' ? 'info' : 'neutral'}>
                    {i.role === 'admin' ? 'Správce' : 'Člen'}
                  </Badge>
                </Td>
                <Td>{new Date(i.expiresAt).toLocaleDateString('cs-CZ')}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await resendInviteAction(i.id);
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      Odeslat znovu
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('revokeInviteTitle'),
                            description: t('revokeInviteDescription', { email: i.email }),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await revokeInviteAction(i.id);
                            if (!r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Zrušit
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {invites.map((i) => (
          <DataCard key={i.id}>
            <DataCardRow label="E-mail">{i.email}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={i.role === 'admin' ? 'info' : 'neutral'}>
                {i.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Vyprší">{new Date(i.expiresAt).toLocaleDateString('cs-CZ')}</DataCardRow>
            <DataCardActions>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await resendInviteAction(i.id);
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  Odeslat znovu
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('revokeInviteTitle'),
                        description: t('revokeInviteDescription', { email: i.email }),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await revokeInviteAction(i.id);
                        if (!r.ok) setError(r.error);
                      });
                    })();
                  }}
                >
                  Zrušit
                </Button>
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
  ```

- [ ] **Step 4: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 2: Pending Invites Table — Fix PendingInvites Import

**Files:**

- Modify: `apps/web/src/app/(authenticated)/members/MembersManager.tsx`

- [ ] **Step 1: Add DataCard imports to PendingInvites**
      (Already done in Task 1, Step 1 — the import line covers both MembersManager and PendingInvites)

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 3: Companies Table → DataCard Mobile Pattern

**Files:**

- Modify: `apps/web/src/app/(authenticated)/companies/CompaniesManager.tsx`

- [ ] **Step 1: Import DataCard components**
      Current:

  ```
  import {
    Alert,
    Badge,
    Button,
    Field,
    FieldGroup,
    Input,
    Table,
    THead,
    Th,
    Tr,
    Td,
    useConfirm,
  } from '@tt/ui';
  ```

  New:

  ```
  import {
    Alert,
    Badge,
    Button,
    DataCard,
    DataCardRow,
    DataCardActions,
    Field,
    FieldGroup,
    Input,
    Table,
    THead,
    Th,
    Tr,
    Td,
    useConfirm,
  } from '@tt/ui';
  ```

- [ ] **Step 2: Wrap CompaniesManager table in hidden md:table and add mobile cards**
      Replace the entire `<Table>` block (lines 79–163) with:

  ```
  Current:
      <Table>
        <THead>
          <tr>
            <Th>Název</Th>
            <Th>Role</Th>
            <Th>Stav</Th>
            <Th className="text-right">Akce</Th>
          </tr>
        </THead>
        <tbody>
          {memberships.map((m) => (
            <Tr key={m.companyId}>
              <Td className="font-medium">{m.companyName}</Td>
              <Td>
                <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                  {m.role === 'admin' ? 'Správce' : 'Člen'}
                </Badge>
              </Td>
              <Td>
                {m.companyId === activeCompanyId ? (
                  <Badge tone="success">aktivní</Badge>
                ) : (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">—</span>
                )}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  {m.companyId !== activeCompanyId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => startTransition(() => switchCompanyAction(m.companyId))}
                    >
                      Přepnout
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: t('leaveTitle', { name: m.companyName }),
                          description: t('leaveDescription'),
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const r = await leaveCompanyAction(m.companyId);
                          if (!r.ok) setError(r.error);
                        });
                      })();
                    }}
                  >
                    Opustit
                  </Button>
                  {m.role === 'admin' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={pending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('deleteTitle', { name: m.companyName }),
                            description: t('deleteDescription'),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await deleteCompanyAction(m.companyId);
                            if (r && !r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Smazat
                    </Button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

  New:
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Název</Th>
              <Th>Role</Th>
              <Th>Stav</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {memberships.map((m) => (
              <Tr key={m.companyId}>
                <Td className="font-medium">{m.companyName}</Td>
                <Td>
                  <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                    {m.role === 'admin' ? 'Správce' : 'Člen'}
                  </Badge>
                </Td>
                <Td>
                  {m.companyId === activeCompanyId ? (
                    <Badge tone="success">aktivní</Badge>
                  ) : (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {m.companyId !== activeCompanyId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() => startTransition(() => switchCompanyAction(m.companyId))}
                      >
                        Přepnout
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('leaveTitle', { name: m.companyName }),
                            description: t('leaveDescription'),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await leaveCompanyAction(m.companyId);
                            if (!r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Opustit
                    </Button>
                    {m.role === 'admin' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={pending}
                        onClick={() => {
                          void (async () => {
                            const ok = await confirm({
                              title: t('deleteTitle', { name: m.companyName }),
                              description: t('deleteDescription'),
                            });
                            if (!ok) return;
                            startTransition(async () => {
                              const r = await deleteCompanyAction(m.companyId);
                              if (r && !r.ok) setError(r.error);
                            });
                          })();
                        }}
                      >
                        Smazat
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {memberships.map((m) => (
          <DataCard key={m.companyId}>
            <DataCardRow label="Název">{m.companyName}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                {m.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Stav">
              {m.companyId === activeCompanyId ? (
                <Badge tone="success">aktivní</Badge>
              ) : (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">—</span>
              )}
            </DataCardRow>
            <DataCardActions>
              <div className="flex flex-col gap-2 sm:flex-row">
                {m.companyId !== activeCompanyId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => startTransition(() => switchCompanyAction(m.companyId))}
                  >
                    Přepnout
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('leaveTitle', { name: m.companyName }),
                        description: t('leaveDescription'),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await leaveCompanyAction(m.companyId);
                        if (!r.ok) setError(r.error);
                      });
                    })();
                  }}
                >
                  Opustit
                </Button>
                {m.role === 'admin' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={pending}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: t('deleteTitle', { name: m.companyName }),
                          description: t('deleteDescription'),
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const r = await deleteCompanyAction(m.companyId);
                          if (r && !r.ok) setError(r.error);
                        });
                      })();
                    }}
                  >
                    Smazat
                  </Button>
                ) : null}
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
  ```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 4: InviteForm Grid — Tighten Gap

**Files:**

- Modify: `apps/web/src/app/(authenticated)/members/InviteForm.tsx`

- [ ] **Step 1: Tighten gap in InviteForm grid**
      Current (line 31):

  ```
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
  ```

  New:

  ```
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
  ```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 5: ClientRow Header — Stack Actions on Mobile

**Files:**

- Modify: `apps/web/src/app/(authenticated)/clients/ClientRow.tsx`

- [ ] **Step 1: Update header layout to flex-col sm:flex-row**
      Current (line 132):

  ```
      <div className="flex items-center justify-between gap-3">
  ```

  New:

  ```
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  ```

- [ ] **Step 2: Add truncate to client name**
      Current (line 191):

  ```
              <span
                className={`font-medium ${
                  client.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {client.name}
              </span>
  ```

  New:

  ```
              <span
                className={`font-medium truncate ${
                  client.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {client.name}
              </span>
  ```

- [ ] **Step 3: Stack action buttons on mobile in ClientRow**
      Current (line 218):

  ```
        <div className="flex items-center gap-2">
  ```

  New:

  ```
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  ```

- [ ] **Step 4: Update add-project form to flex-col sm:flex-row**
      Current (line 274):

  ```
          <form onSubmit={onAddProject} className="flex gap-2">
  ```

  New:

  ```
          <form onSubmit={onAddProject} className="flex flex-col gap-2 sm:flex-row">
  ```

- [ ] **Step 5: Make add-project input full-width on mobile**
      Current (line 275):

  ```
            <Input name="name" placeholder="Nový projekt" />
  ```

  New:

  ```
            <Input name="name" placeholder="Nový projekt" className="w-full sm:max-w-xs" />
  ```

- [ ] **Step 6: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 6: ProjectRow Header — Stack Actions on Mobile

**Files:**

- Modify: `apps/web/src/app/(authenticated)/clients/ProjectRow.tsx`

- [ ] **Step 1: Update header layout to flex-col sm:flex-row**
      Current (line 67):

  ```
      <div className="flex items-center justify-between gap-3">
  ```

  New:

  ```
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  ```

- [ ] **Step 2: Add truncate to project name**
      Current (line 118):

  ```
              <span
                className={
                  project.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-800 dark:text-zinc-200'
                }
              >
                {project.name}
              </span>
  ```

  New:

  ```
              <span
                className={`truncate ${
                  project.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-800 dark:text-zinc-200'
                }`}
              >
                {project.name}
              </span>
  ```

- [ ] **Step 3: Stack action buttons on mobile in ProjectRow**
      Current (line 145):

  ```
        <div className="flex gap-1.5">
  ```

  New:

  ```
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  ```

- [ ] **Step 4: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 7: ClientsManager Add-Client Form — Flex-Col on Mobile

**Files:**

- Modify: `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`

- [ ] **Step 1: Update new-client form to flex-col sm:flex-row**
      Current (line 141):

  ```
            <div className="flex gap-2">
  ```

  New:

  ```
            <div className="flex flex-col gap-2 sm:flex-row">
  ```

- [ ] **Step 2: Make new-client input full-width on mobile**
      Current (line 142):

  ```
              <Input id="new-client" name="name" placeholder="Název klienta" required />
  ```

  New:

  ```
              <Input id="new-client" name="name" placeholder="Název klienta" required className="w-full sm:max-w-xs" />
  ```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 8: TagsManager Color Swatches — Increase Size

**Files:**

- Modify: `apps/web/src/app/(authenticated)/tags/TagsManager.tsx`

- [ ] **Step 1: Increase new-tag color swatch size to h-8 w-8**
      Current (line 61):

  ```
                    className={`h-6 w-6 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : ''}`}
  ```

  New:

  ```
                    className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : ''}`}
  ```

- [ ] **Step 2: Increase edit-tag color swatch size to h-5 w-5**
      Current (line 167):

  ```
            className="h-4 w-4 rounded-full"
  ```

  New:

  ```
            className="h-5 w-5 rounded-full"
  ```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 9: Verification

- [ ] **Step 1: Run full typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

- [ ] **Step 2: Verify responsive behavior**
      Manually test on mobile and tablet to confirm:
  - Members/pending invites/companies tables hide on mobile and show DataCard mobile pattern
  - ClientRow/ProjectRow actions stack vertically on mobile
  - Rename/add forms stack vertically on mobile
  - Tag color swatches are appropriately sized
  - All interactive controls are >= 40px on mobile

---

### Phase 4.4 — Audit, Trash, Extension page

## Writing Plan: Audit + Trash + Extension Page Responsive Edits

### Task 1: Create DataCard and DataCardRow components in UI package

**Files:**

- Create: `packages/ui/src/data-card.tsx`
- Modify: `packages/ui/src/index.ts`

**Description:** Add the mobile-optimized DataCard component (bordered container for card rows on mobile) and supporting components as specified in the shared contracts.

- [ ] **Step 1: Create data-card.tsx with DataCard, DataCardRow, and DataCardActions components**

```typescript
// Create file: packages/ui/src/data-card.tsx
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

export function DataCard(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800 p-4',
        props.className,
      )}
    />
  );
}

export function DataCardRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('flex justify-between items-start gap-2 py-2', className)}>
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-900 dark:text-zinc-100">{children}</span>
    </div>
  );
}

export function DataCardActions(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-700/60 mt-3',
        props.className,
      )}
    />
  );
}
```

- [ ] **Step 2: Export DataCard, DataCardRow, DataCardActions from index.ts**

Current:

```typescript
export {
  ConfirmProvider,
  useConfirm,
  type ConfirmFn,
  type ConfirmOptions,
} from './confirm-provider.js';
export { SearchInput, type SearchInputProps } from './search-input.js';
```

New:

```typescript
export {
  ConfirmProvider,
  useConfirm,
  type ConfirmFn,
  type ConfirmOptions,
} from './confirm-provider.js';
export { SearchInput, type SearchInputProps } from './search-input.js';
export { DataCard, DataCardRow, DataCardActions } from './data-card.js';
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/ui typecheck`
      Expected: PASS

---

### Task 2: Convert audit page table to responsive design with DataCard mobile layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/audit/page.tsx`

**Description:** Update the audit table to hide on mobile and show DataCard layout on mobile. Update filter form to stack vertically on mobile and horizontally on desktop. Apply timestamp formatting to show date-only on mobile.

- [ ] **Step 1: Add DataCard imports**

Current:

```typescript
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  THead,
  Th,
  Tr,
  Td,
} from '@tt/ui';
```

New:

```typescript
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  THead,
  Th,
  Tr,
  Td,
  DataCard,
  DataCardRow,
  DataCardActions,
} from '@tt/ui';
```

- [ ] **Step 2: Update filter form to stack flex-col on mobile, flex-row on desktop**

Current:

```typescript
<form method="get" className="mb-4 flex flex-wrap items-end gap-3">
```

New:

```typescript
<form method="get" className="mb-4 flex flex-col md:flex-row md:flex-wrap md:items-end gap-3">
```

- [ ] **Step 3: Update all filter inputs/selects to be full-width on mobile**

Current (select at line 81-92):

```typescript
<select
  name="action"
  defaultValue={sp.action ?? ''}
  className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm"
>
```

New:

```typescript
<select
  name="action"
  defaultValue={sp.action ?? ''}
  className="w-full md:w-auto rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm"
>
```

- [ ] **Step 4: Update all label containers to match**

Current (lines 77, 94, 105, 114):

```typescript
<label className="space-y-1">
```

New:

```typescript
<label className="space-y-1 w-full md:w-auto">
```

Apply to all 4 labels (lines ~77, 94, 105, 114)

- [ ] **Step 5: Update button to be full-width on mobile**

Current:

```typescript
<button
  type="submit"
  className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
>
```

New:

```typescript
<button
  type="submit"
  className="w-full md:w-auto rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
>
```

- [ ] **Step 6: Hide table on mobile, show mobile cards layout**

Current (lines 131-168):

```typescript
{result.value.rows.length === 0 ? (
  <EmptyState title="Žádné záznamy" />
) : (
  <Table>
    <THead>
      <tr>
        <Th>Kdy</Th>
        <Th>Kdo</Th>
        <Th>Akce</Th>
        <Th>Entita</Th>
        <Th>ID</Th>
      </tr>
    </THead>
    <tbody>
      {result.value.rows.map((r) => (
        <Tr key={r.id}>
          <Td className="whitespace-nowrap font-mono text-xs">
            {r.createdAt.toLocaleString('cs-CZ')}
          </Td>
          <Td>
            {r.actorUserId
              ? (userMap.get(r.actorUserId)?.fullName ?? r.actorUserId)
              : '—'}
          </Td>
          <Td>
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs">
              {r.action}
            </span>
          </Td>
          <Td>{r.entityType}</Td>
          <Td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {r.entityId}
          </Td>
        </Tr>
      ))}
    </tbody>
  </Table>
)}
```

New:

```typescript
{result.value.rows.length === 0 ? (
  <EmptyState title="Žádné záznamy" />
) : (
  <>
    <div className="hidden md:block">
      <Table>
        <THead>
          <tr>
            <Th>Kdy</Th>
            <Th>Kdo</Th>
            <Th>Akce</Th>
            <Th>Entita</Th>
            <Th>ID</Th>
          </tr>
        </THead>
        <tbody>
          {result.value.rows.map((r) => (
            <Tr key={r.id}>
              <Td className="whitespace-nowrap font-mono text-xs">
                {r.createdAt.toLocaleString('cs-CZ')}
              </Td>
              <Td>
                {r.actorUserId
                  ? (userMap.get(r.actorUserId)?.fullName ?? r.actorUserId)
                  : '—'}
              </Td>
              <Td>
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs">
                  {r.action}
                </span>
              </Td>
              <Td>{r.entityType}</Td>
              <Td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {r.entityId}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
    <ul className="space-y-3 md:hidden">
      {result.value.rows.map((r) => (
        <li key={r.id}>
          <DataCard>
            <DataCardRow label="Kdy">
              <span className="font-mono text-xs">
                <span className="hidden sm:inline">{r.createdAt.toLocaleString('cs-CZ')}</span>
                <span className="sm:hidden">{new Date(r.createdAt).toLocaleDateString('cs-CZ')}</span>
              </span>
            </DataCardRow>
            <DataCardRow label="Kdo">
              {r.actorUserId
                ? (userMap.get(r.actorUserId)?.fullName ?? r.actorUserId)
                : '—'}
            </DataCardRow>
            <DataCardRow label="Akce">
              <span className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs">
                {r.action}
              </span>
            </DataCardRow>
            <DataCardRow label="Entita">
              {r.entityType}
            </DataCardRow>
            <DataCardRow label="ID">
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {r.entityId}
              </span>
            </DataCardRow>
          </DataCard>
        </li>
      ))}
    </ul>
  </>
)}
```

- [ ] **Step 7: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 3: Convert trash page table to responsive design with DataCard mobile layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/trash/TrashList.tsx`

**Description:** Update the trash table to hide on mobile and show DataCard layout with restore button in DataCardActions.

- [ ] **Step 1: Add DataCard imports**

Current:

```typescript
import { Alert, Button, Table, THead, Th, Tr, Td } from '@tt/ui';
```

New:

```typescript
import {
  Alert,
  Button,
  Table,
  THead,
  Th,
  Tr,
  Td,
  DataCard,
  DataCardRow,
  DataCardActions,
} from '@tt/ui';
```

- [ ] **Step 2: Replace table with hidden table + mobile card layout**

Current (lines 20-71):

```typescript
<div>
  {error ? (
    <Alert tone="danger" className="mb-3">
      {error}
    </Alert>
  ) : null}
  <Table>
    <THead>
      <tr>
        <Th>Popis</Th>
        <Th>Uživatel</Th>
        <Th>Klient</Th>
        <Th>Smazáno</Th>
        <Th className="text-right">Akce</Th>
      </tr>
    </THead>
    <tbody>
      {entries.map((e) => (
        <Tr key={e.id}>
          <Td className="max-w-xs truncate">
            {e.description || (
              <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
            )}
          </Td>
          <Td>{e.userName}</Td>
          <Td className="text-zinc-700 dark:text-zinc-300">
            {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
          </Td>
          <Td className="font-mono text-xs">{new Date(e.deletedAt).toLocaleString('cs-CZ')}</Td>
          <Td className="text-right">
            <Button
              size="sm"
              variant="ghost"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await restoreEntryAction(e.id);
                  if (!r.ok) setError(r.error);
                })
              }
            >
              Obnovit
            </Button>
          </Td>
        </Tr>
      ))}
    </tbody>
  </Table>
</div>
```

New:

```typescript
<div>
  {error ? (
    <Alert tone="danger" className="mb-3">
      {error}
    </Alert>
  ) : null}
  <div className="hidden md:block">
    <Table>
      <THead>
        <tr>
          <Th>Popis</Th>
          <Th>Uživatel</Th>
          <Th>Klient</Th>
          <Th>Smazáno</Th>
          <Th className="text-right">Akce</Th>
        </tr>
      </THead>
      <tbody>
        {entries.map((e) => (
          <Tr key={e.id}>
            <Td className="max-w-xs truncate">
              {e.description || (
                <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
              )}
            </Td>
            <Td>{e.userName}</Td>
            <Td className="text-zinc-700 dark:text-zinc-300">
              {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
            </Td>
            <Td className="font-mono text-xs">{new Date(e.deletedAt).toLocaleString('cs-CZ')}</Td>
            <Td className="text-right">
              <Button
                size="sm"
                variant="ghost"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await restoreEntryAction(e.id);
                    if (!r.ok) setError(r.error);
                  })
                }
              >
                Obnovit
              </Button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  </div>
  <ul className="space-y-3 md:hidden">
    {entries.map((e) => (
      <li key={e.id}>
        <DataCard>
          <DataCardRow label="Popis">
            {e.description || (
              <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
            )}
          </DataCardRow>
          <DataCardRow label="Uživatel">
            {e.userName}
          </DataCardRow>
          <DataCardRow label="Klient">
            <span className="text-zinc-700 dark:text-zinc-300">
              {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
            </span>
          </DataCardRow>
          <DataCardRow label="Smazáno">
            <span className="font-mono text-xs">
              <span className="hidden sm:inline">{new Date(e.deletedAt).toLocaleString('cs-CZ')}</span>
              <span className="sm:hidden">{new Date(e.deletedAt).toLocaleDateString('cs-CZ')}</span>
            </span>
          </DataCardRow>
          <DataCardActions>
            <Button
              size="sm"
              variant="ghost"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await restoreEntryAction(e.id);
                  if (!r.ok) setError(r.error);
                })
              }
            >
              Obnovit
            </Button>
          </DataCardActions>
        </DataCard>
      </li>
    ))}
  </ul>
</div>
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 4: Update extension page for responsive layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/extension/page.tsx`

**Description:** Change intro flex layout from flex-wrap to flex-col on mobile and flex-row on desktop. Reduce ordered list padding on mobile from pl-5 to pl-4.

- [ ] **Step 1: Update intro div flex layout**

Current (line 19):

```typescript
<div className="flex flex-wrap items-center gap-4">
```

New:

```typescript
<div className="flex flex-col md:flex-row items-start md:items-center gap-4">
```

- [ ] **Step 2: Update ordered list padding**

Current (line 33):

```typescript
<ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
```

New:

```typescript
<ol className="list-decimal space-y-3 pl-4 sm:pl-5 text-sm text-zinc-700 dark:text-zinc-300">
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Phase 4.5 — Settings + API tokens

### Task 1: API Tokens page — table to DataCard mobile pattern

**Files:**

- Modify: `apps/web/src/app/(authenticated)/settings/api-tokens/page.tsx`

- [ ] **Step 1: Import DataCard components**

Current (after imports on line 15):

```
import { PageHeader } from '@/components/PageHeader';
import { prisma, requireUser } from '@/lib/session';
import { listTokens } from '@/lib/services/api-tokens';
import { CreateTokenDialog } from './CreateTokenDialog';
import { RevokeTokenButton } from './RevokeTokenButton';
```

New:

```
import { PageHeader } from '@/components/PageHeader';
import { prisma, requireUser } from '@/lib/session';
import { listTokens } from '@/lib/services/api-tokens';
import { DataCard, DataCardRow, DataCardActions } from '@tt/ui';
import { CreateTokenDialog } from './CreateTokenDialog';
import { RevokeTokenButton } from './RevokeTokenButton';
```

- [ ] **Step 2: Update CardHeader to support stacking on mobile**

Current (lines 50–57):

```
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('title')}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('subtitle')}</p>
            </div>
            <CreateTokenDialog companies={companies} />
          </div>
        </CardHeader>
```

New:

```
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('subtitle')}</p>
          </div>
          <CreateTokenDialog companies={companies} />
        </CardHeader>
```

- [ ] **Step 3: Replace Table with DataCard pattern in CardBody**

Current (lines 59–100):

```
        <CardBody className="p-0">
          {tokens.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState title={t('empty')} />
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{t('name')}</Th>
                  <Th>{t('company')}</Th>
                  <Th>{t('createdAt')}</Th>
                  <Th>{t('lastUsed')}</Th>
                  <Th>{t('status')}</Th>
                  <Th />
                </tr>
              </THead>
              <tbody>
                {tokens.map((token) => (
                  <Tr key={token.id}>
                    <Td>
                      <span className="font-medium">{token.name}</span>
                      <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {token.prefix}…
                      </span>
                    </Td>
                    <Td>{companyMap.get(token.companyId) ?? token.companyId}</Td>
                    <Td>{formatDate(token.createdAt)}</Td>
                    <Td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : '—'}</Td>
                    <Td>
                      {token.revokedAt ? (
                        <Badge tone="danger">{t('revoked')}</Badge>
                      ) : (
                        <Badge tone="success">{t('active')}</Badge>
                      )}
                    </Td>
                    <Td>{!token.revokedAt && <RevokeTokenButton tokenId={token.id} />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
```

New:

```
        <CardBody className="p-0">
          {tokens.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState title={t('empty')} />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>{t('name')}</Th>
                      <Th>{t('company')}</Th>
                      <Th>{t('createdAt')}</Th>
                      <Th>{t('lastUsed')}</Th>
                      <Th>{t('status')}</Th>
                      <Th />
                    </tr>
                  </THead>
                  <tbody>
                    {tokens.map((token) => (
                      <Tr key={token.id}>
                        <Td>
                          <span className="font-medium">{token.name}</span>
                          <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                            {token.prefix}…
                          </span>
                        </Td>
                        <Td>{companyMap.get(token.companyId) ?? token.companyId}</Td>
                        <Td>{formatDate(token.createdAt)}</Td>
                        <Td>{token.lastUsedAt ? formatDate(token.lastUsedAt) : '—'}</Td>
                        <Td>
                          {token.revokedAt ? (
                            <Badge tone="danger">{t('revoked')}</Badge>
                          ) : (
                            <Badge tone="success">{t('active')}</Badge>
                          )}
                        </Td>
                        <Td>{!token.revokedAt && <RevokeTokenButton tokenId={token.id} />}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <ul className="space-y-3 px-4 py-6 md:hidden">
                {tokens.map((token) => (
                  <DataCard key={token.id}>
                    <DataCardRow label={t('name')}>
                      <div>
                        <span className="font-medium">{token.name}</span>
                        <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {token.prefix}…
                        </span>
                      </div>
                    </DataCardRow>
                    <DataCardRow label={t('company')}>
                      {companyMap.get(token.companyId) ?? token.companyId}
                    </DataCardRow>
                    <DataCardRow label={t('createdAt')}>
                      {formatDate(token.createdAt)}
                    </DataCardRow>
                    <DataCardRow label={t('lastUsed')}>
                      {token.lastUsedAt ? formatDate(token.lastUsedAt) : '—'}
                    </DataCardRow>
                    <DataCardRow label={t('status')}>
                      {token.revokedAt ? (
                        <Badge tone="danger">{t('revoked')}</Badge>
                      ) : (
                        <Badge tone="success">{t('active')}</Badge>
                      )}
                    </DataCardRow>
                    <DataCardActions>
                      {!token.revokedAt && <RevokeTokenButton tokenId={token.id} />}
                    </DataCardActions>
                  </DataCard>
                ))}
              </ul>
            </>
          )}
        </CardBody>
```

- [ ] **Step 4: Remove unused table imports if not needed elsewhere**

Check if `Table`, `THead`, `Th`, `Tr`, `Td` are now only used in the desktop `<div className="hidden md:block">` section. If so, they can remain; if they become unused, remove from line 10–14. (They are still used, so keep them.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @tt/web typecheck`

Expected: PASS

---

### Task 2: TotpManager — responsive QR code and recovery codes grid

**Files:**

- Modify: `apps/web/src/app/(authenticated)/settings/TotpManager.tsx`

- [ ] **Step 1: Update recovery codes grid to responsive**

Current (lines 29–32):

```
        <ul className="grid grid-cols-2 gap-2 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 font-mono text-sm">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
```

New:

```
        <ul className="grid grid-cols-1 gap-2 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 font-mono text-sm sm:grid-cols-2">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
```

- [ ] **Step 2: Wrap QR code image with responsive sizing container**

Current (lines 47–53):

```
        <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 sm:flex-row">
          <img
            src={enrollment.qrDataUrl}
            alt="QR kód pro 2FA"
            width={224}
            height={224}
            className="shrink-0 rounded border border-zinc-100 dark:border-zinc-700/60"
          />
```

New:

```
        <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 sm:flex-row">
          <div className="max-w-[180px] w-full h-auto sm:max-w-[224px] sm:w-auto sm:h-auto shrink-0">
            <img
              src={enrollment.qrDataUrl}
              alt="QR kód pro 2FA"
              width={224}
              height={224}
              className="w-full h-auto rounded border border-zinc-100 dark:border-zinc-700/60"
            />
          </div>
```

- [ ] **Step 3: Close the wrapper div**

After the closing `/>` of the img tag on line 52, add:

```
          </div>
```

(The closing tag for the new wrapper div.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @tt/web typecheck`

Expected: PASS

---

### Task 3: CreateTokenDialog — responsive padding and button layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/settings/api-tokens/CreateTokenDialog.tsx`

- [ ] **Step 1: Update dialog container padding**

Current (line 54):

```
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
```

New:

```
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 sm:p-6">
```

- [ ] **Step 2: Update token display button layout to responsive stack**

Current (lines 66–80):

```
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(plaintext);
                }}
              >
                {t('copy')}
              </Button>
              <a
                href={buildDownloadHref(plaintext)}
                download="claude-mcp.json"
                className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {t('downloadConfig')}
              </a>
            </div>
```

New:

```
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(plaintext);
                }}
                className="w-full sm:w-auto"
              >
                {t('copy')}
              </Button>
              <a
                href={buildDownloadHref(plaintext)}
                download="claude-mcp.json"
                className="inline-flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 sm:w-auto"
              >
                {t('downloadConfig')}
              </a>
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tt/web typecheck`

Expected: PASS

---

### Summary of Changes

Three files modified to add mobile responsiveness:

1. **api-tokens/page.tsx**: Convert token table to DataCard pattern on mobile (`< md`), keep desktop table visible at `md` and above; update CardHeader to stack flexbox for title + button.

2. **TotpManager.tsx**: Make recovery codes grid responsive (`grid-cols-1 sm:grid-cols-2`); wrap QR code in responsive container (`max-w-[180px] sm:max-w-[224px]`).

3. **CreateTokenDialog.tsx**: Reduce dialog padding on mobile (`p-4`) and increase at `sm` and above (`sm:p-6`); change token display buttons to vertical stack on mobile (`flex-col sm:flex-row`) with full width (`w-full sm:w-auto`).

All edits preserve existing functionality while improving mobile touch targets and layout at the `md` (768px) breakpoint.

---

### Phase 4.6 — Public + auth pages

### Task 1: Login page — responsive padding

**Files:**

- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Update main wrapper padding**

Current:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 2: Login forms — mode buttons and TOTP input

**Files:**

- Modify: `apps/web/src/app/login/LoginForms.tsx`

- [ ] **Step 1: Update mode-toggle button padding**

Current:

```
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
```

New (for BOTH buttons):

```
            className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
```

(This change applies to lines 96 and 110 — both the "Heslo" and "Odkaz na e-mail" buttons)

- [ ] **Step 2: Update TOTP input text size and letter spacing**

Current:

```
                className="text-center font-mono text-lg tracking-widest"
```

New:

```
                className="text-center font-mono text-base sm:text-lg tracking-wider sm:tracking-widest"
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 3: Reset password page — responsive padding

**Files:**

- Modify: `apps/web/src/app/reset/page.tsx`

- [ ] **Step 1: Update main wrapper padding**

Current:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 4: Reset password form — success link uses Button component

**Files:**

- Modify: `apps/web/src/app/reset/ResetPasswordForm.tsx`

- [ ] **Step 1: Import Button component (already imported, skip)**

- [ ] **Step 2: Replace inline success link with Button**

Current:

```
      <div className="space-y-4">
        <Alert tone="success">Heslo bylo nastaveno. Můžete se přihlásit.</Alert>
        <Link
          href="/login"
          className="block w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          Přejít na přihlášení
        </Link>
      </div>
```

New:

```
      <div className="space-y-4">
        <Alert tone="success">Heslo bylo nastaveno. Můžete se přihlásit.</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Přejít na přihlášení</Link>
        </Button>
      </div>
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 5: Invite page — responsive padding

**Files:**

- Modify: `apps/web/src/app/invite/[token]/page.tsx`

- [ ] **Step 1: Update main wrapper padding**

Current:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 6: Invite accept form — email & role layout responsive

**Files:**

- Modify: `apps/web/src/app/invite/[token]/InviteAcceptForm.tsx`

- [ ] **Step 1: Update email & role line to responsive flex layout**

Current:

```
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        E-mail: <strong>{email}</strong> &middot; Role:{' '}
        <Badge tone={role === 'admin' ? 'info' : 'neutral'}>
          {role === 'admin' ? 'Správce' : 'Člen'}
        </Badge>
      </p>
```

New:

```
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-zinc-700 dark:text-zinc-300">
        <span>
          E-mail: <strong>{email}</strong>
        </span>
        <span className="flex items-center gap-2">
          Role:{' '}
          <Badge tone={role === 'admin' ? 'info' : 'neutral'}>
            {role === 'admin' ? 'Správce' : 'Člen'}
          </Badge>
        </span>
      </div>
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 7: Privacy page — responsive padding

**Files:**

- Modify: `apps/web/src/app/privacy/page.tsx`

- [ ] **Step 1: Update main wrapper padding**

Current:

```
    <main className="flex min-h-screen items-start justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
    <main className="flex min-h-screen items-start justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 8: Extension connect page — responsive padding

**Files:**

- Modify: `apps/web/src/app/extension/connect/page.tsx`

- [ ] **Step 1: Update main wrapper padding (invalid ID error state)**

Current (line 39):

```
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 2: Update main wrapper padding (success state)**

Current (line 63):

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
```

New:

```
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
```

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

### Task 9: Connect bridge — verify inline code is already handled globally

**Files:**

- Verify: `apps/web/src/app/extension/connect/ConnectBridge.tsx`

- [ ] **Step 1: Verify no changes needed**

The file contains inline `<code>` elements at lines 91–92. Per spec §5.6, inline `<code>` wrapping is handled globally in Phase 1 (overflow-wrap: anywhere in global CSS). No per-file edit needed.

- [ ] **Step 2: Typecheck**
      Run: `pnpm --filter @tt/web typecheck`
      Expected: PASS

---

## Phase 5 — Verification & documentation

### Task V1: Responsive Playwright matrix

**Files:**

- Create: `apps/web/tests/e2e/responsive.spec.ts`

The harness authenticates automatically as the seeded admin via storage state (`tests/e2e/.auth/admin.json`), base URL `http://localhost:3100`, and seeds a company + clients/projects in `global-setup.ts` — so all admin routes render with content. (No `@testing-library/react` in the repo; this Playwright spec is the responsiveness gate.)

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

// Admin storage state can reach every route.
const ROUTES = [
  '/timer',
  '/dashboard',
  '/reports',
  '/clients',
  '/tags',
  '/members',
  '/companies',
  '/audit',
  '/trash',
  '/settings',
  '/settings/api-tokens',
  '/extension',
];

test.describe('responsive layout', () => {
  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow @ ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow on ${route} @ ${vp.width}px`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('mobile shows the bottom tab bar; desktop hides it (sidebar instead)', async ({ page }) => {
    const tabBar = page.locator('nav[aria-label="Hlavní navigace"]');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/timer');
    await expect(tabBar).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(tabBar).toBeHidden();
  });

  test('More sheet exposes company switcher + logout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/timer');
    await page.getByRole('button', { name: 'Více' }).click();
    const sheet = page.getByRole('dialog', { name: 'Více' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Aktivní firma')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Odhlásit' })).toBeVisible();
  });

  test('members: table on desktop, cards on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/members');
    await expect(page.locator('table').first()).toBeVisible();
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(page.locator('table').first()).toBeHidden();
  });
});
```

- [ ] **Step 2: Run the matrix — expect it to surface any remaining offenders**

Run the project's Playwright command for this spec (see `apps/web/package.json` scripts — typically one of):

```bash
pnpm --filter @tt/web build
pnpm --filter @tt/web test:e2e -- responsive.spec.ts
```

Expected: PASS. If a specific route fails `no horizontal overflow`, fix that route's offending element (usually a non-wrapping flex row, a fixed `w-*`, or a table not wrapped in `hidden md:block`) and re-run — this is the catch-all that proves the sweep is complete.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/responsive.spec.ts
git commit -m "test(responsive): viewport matrix — no overflow, mobile nav, table→cards"
```

### Task V2: Architecture doc

**Files:**

- Create: `docs/architecture/mobile-layout.md`
- Modify: `docs/superpowers/specs/2026-06-02-responsive-app-design.md` (flip Status to `Implemented`)

- [ ] **Step 1: Write `docs/architecture/mobile-layout.md`:**

```markdown
# Mobile layout & responsiveness

How the web app adapts from 360px phones to desktop. Implemented 2026-06.

## Breakpoint model

One primary switch at Tailwind `md` (768px). Below md = "mobile shell"; at/above = desktop.

| Width   | Shell nav                   | Tables                     | Forms/grids                |
| ------- | --------------------------- | -------------------------- | -------------------------- |
| `< 768` | Bottom tab bar + More sheet | Stacked cards (`DataCard`) | 1 col, full-width controls |
| `≥ 768` | Sidebar                     | `<table>`                  | desktop layout             |

`sm` (640px) is used for intra-component refinement (e.g. 2-up date inputs).

## Z-index scale (single source of truth — mirrored in `globals.css`)

| Layer                                     | z      |
| ----------------------------------------- | ------ |
| Desktop sticky sidebar                    | `z-10` |
| In-page sticky headers                    | `z-20` |
| Mobile bottom tab bar + mobile top header | `z-30` |
| Open custom popovers (`MultiSelect`)      | `z-40` |
| Modals + More sheet (backdrop & panel)    | `z-50` |

Native `<select>` (incl. `CompanySwitcher`) needs no z-index — the browser paints its dropdown on top.

## Bottom-bar / safe-area contract

- Root layout exports `viewport` with `viewportFit: 'cover'`.
- The mobile bar is `fixed bottom-0 h-[var(--tab-bar-height)]` (56px) with `pb-[env(safe-area-inset-bottom)]`.
- Authenticated `<main>` reserves clearance: `pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] md:pb-8`.
- The mobile header has `pt-[env(safe-area-inset-top)]`.

## Bottom tab bar

`getBottomTabs(isAdmin)` returns the first 4 visible items in `BOTTOM_BAR_ORDER`; the rest + company switcher + theme + logout live in the More sheet (`getMoreGroups`). Admin: Stopky·Reporty·Klienti·Členové. Non-admin: Stopky·Štítky·Nastavení·Firmy.

## Table → card pattern

`<div className="hidden md:block"><Table>…</Table></div>` (the Table primitive has its own bordered wrapper, so `hidden` goes on the outer div) + a sibling `<ul className="space-y-3 md:hidden">` of `DataCard`s. Card field labels reuse the table's column-header strings.

## Manual device checklist (per release touching layout)

- [ ] iOS Safari: bottom bar clears the home indicator (safe-area); header clears the notch.
- [ ] More sheet: focus trap, `Esc`/backdrop closes, body doesn't scroll behind it.
- [ ] No horizontal scroll on any page at 360px.
- [ ] Tap targets ≥ 40px (row actions, clear buttons, swatches).
```

- [ ] **Step 2:** In `docs/superpowers/specs/2026-06-02-responsive-app-design.md`, change `- **Status:** Approved (pre-implementation)` to `- **Status:** Implemented`.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/mobile-layout.md docs/superpowers/specs/2026-06-02-responsive-app-design.md
git commit -m "docs(responsive): mobile-layout architecture note; mark spec implemented"
```

### Task V3: Full quality gate + finish

- [ ] **Step 1: Run the full gate**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:trace   # US coverage must stay 100%
```

Expected: all PASS. `test:trace` is unchanged (no US added/removed).

- [ ] **Step 2: Run the e2e suite** (or at least `responsive.spec.ts` plus the existing specs that touch changed components — `destructive-confirm`, `time-entry-edit`, `clients-search-reorder`):

```bash
pnpm --filter @tt/web test:e2e
```

Expected: PASS (no behavioural change — existing journeys still work; modals/forms moved but selectors are intact).

- [ ] **Step 3: Finish the branch** — invoke the `superpowers:finishing-a-development-branch` skill to choose merge / PR. The branch is `feat/responsive-app`; the design spec and this plan are already committed on it.
