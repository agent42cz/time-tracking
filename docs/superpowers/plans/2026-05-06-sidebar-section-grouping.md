# Sidebar Section Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 12-item sidebar in `apps/web/src/app/(authenticated)/layout.tsx` with five labeled sections (Sledování, Přehledy, Správa dat, Systém, Účet) and auto-hide sections that have no visible items for the current user.

**Architecture:** Extract a tiny pure helper (`nav.ts`) that holds the grouped nav data and a `filterVisibleGroups(groups, isAdmin)` function. The Server Component layout consumes the filtered output and renders one labeled `<div>` per group. The helper is unit-tested; the rendered layout is verified via manual smoke testing in dev (admin and regular user).

**Tech Stack:** Next.js 15 App Router (Server Component), React 19, Tailwind CSS, Vitest (node env, no React Testing Library).

**Spec deviation note:** The spec said "no new files." This plan adds two small co-located files (`nav.ts` ~30 lines, `nav.test.ts` ~50 lines) so the visibility rules — the actual logic introduced by this change — get locked in by automated tests rather than relying solely on manual smoke testing. The layout.tsx change itself remains the spec-described ~25-line edit.

**Spec:** `docs/superpowers/specs/2026-05-06-sidebar-section-grouping-design.md`

---

## File Structure

| File                                           | Status | Responsibility                                                                                                        |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(authenticated)/nav.ts`      | Create | Defines `NavItem`, `NavGroup` types; exports `navGroups` constant and `filterVisibleGroups` pure helper               |
| `apps/web/src/app/(authenticated)/nav.test.ts` | Create | Unit tests for `filterVisibleGroups` covering admin / non-admin / empty-group drop                                    |
| `apps/web/src/app/(authenticated)/layout.tsx`  | Modify | Replace inline `navItems` array and flat `.map` render with `filterVisibleGroups(navGroups, isAdmin)` and grouped JSX |

No other files change. No dependencies added.

Imports use the project conventions:

- Module under test: `import { filterVisibleGroups, navGroups } from './nav.js'` in test files (NodeNext-style `.js` extension matches existing tests like `apps/web/tests/services/audit.test.ts`).
- Layout consumes the helper as `import { filterVisibleGroups, navGroups } from './nav'` (no extension; matches existing co-located imports in app routes like `import { TimerStartCard } from './TimerStartCard'`).

---

## Task 1: Create the nav helper with tests

**Files:**

- Create: `apps/web/src/app/(authenticated)/nav.ts`
- Create: `apps/web/src/app/(authenticated)/nav.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(authenticated)/nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterVisibleGroups, navGroups, type NavGroup } from './nav.js';

describe('navGroups', () => {
  it('contains all 12 nav items across 5 groups in expected order', () => {
    expect(navGroups.map((g) => g.label)).toEqual([
      'Sledování',
      'Přehledy',
      'Správa dat',
      'Systém',
      'Účet',
    ]);
    const total = navGroups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(12);
  });

  it('lists items in the spec-defined order within each group', () => {
    const byLabel = Object.fromEntries(navGroups.map((g) => [g.label, g.items.map((i) => i.href)]));
    expect(byLabel['Sledování']).toEqual(['/timer', '/timesheet']);
    expect(byLabel['Přehledy']).toEqual(['/dashboard', '/reports']);
    expect(byLabel['Správa dat']).toEqual(['/clients', '/tags', '/members']);
    expect(byLabel['Systém']).toEqual(['/audit', '/trash']);
    expect(byLabel['Účet']).toEqual(['/extension', '/settings', '/companies']);
  });
});

describe('filterVisibleGroups', () => {
  it('returns all five groups with all items for admin', () => {
    const result = filterVisibleGroups(navGroups, true);
    expect(result.map((g) => g.label)).toEqual([
      'Sledování',
      'Přehledy',
      'Správa dat',
      'Systém',
      'Účet',
    ]);
    const total = result.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(12);
  });

  it('drops Přehledy and Systém for non-admin (all-admin groups)', () => {
    const result = filterVisibleGroups(navGroups, false);
    expect(result.map((g) => g.label)).toEqual(['Sledování', 'Správa dat', 'Účet']);
  });

  it('keeps Správa dat with only Štítky for non-admin', () => {
    const result = filterVisibleGroups(navGroups, false);
    const data = result.find((g) => g.label === 'Správa dat');
    expect(data?.items.map((i) => i.label)).toEqual(['Štítky']);
  });

  it('keeps Sledování and Účet intact for non-admin', () => {
    const result = filterVisibleGroups(navGroups, false);
    expect(result.find((g) => g.label === 'Sledování')?.items.map((i) => i.href)).toEqual([
      '/timer',
      '/timesheet',
    ]);
    expect(result.find((g) => g.label === 'Účet')?.items.map((i) => i.href)).toEqual([
      '/extension',
      '/settings',
      '/companies',
    ]);
  });

  it('drops a group whose every item is admin-only when caller is not admin', () => {
    const groups: NavGroup[] = [
      { label: 'AllAdmin', items: [{ href: '/x', label: 'X', admin: true }] },
      { label: 'Mixed', items: [{ href: '/y', label: 'Y' }] },
    ];
    expect(filterVisibleGroups(groups, false).map((g) => g.label)).toEqual(['Mixed']);
  });

  it('does not mutate the input array', () => {
    const before = JSON.stringify(navGroups);
    filterVisibleGroups(navGroups, false);
    expect(JSON.stringify(navGroups)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @tt/web test -- nav.test`

Expected: FAIL — Vitest reports cannot resolve `./nav.js` (file does not exist yet).

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/app/(authenticated)/nav.ts`:

```ts
export type NavItem = { href: string; label: string; admin?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: 'Sledování',
    items: [
      { href: '/timer', label: 'Stopky' },
      { href: '/timesheet', label: 'Výkaz' },
    ],
  },
  {
    label: 'Přehledy',
    items: [
      { href: '/dashboard', label: 'Dashboard', admin: true },
      { href: '/reports', label: 'Reporty', admin: true },
    ],
  },
  {
    label: 'Správa dat',
    items: [
      { href: '/clients', label: 'Klienti', admin: true },
      { href: '/tags', label: 'Štítky' },
      { href: '/members', label: 'Členové', admin: true },
    ],
  },
  {
    label: 'Systém',
    items: [
      { href: '/audit', label: 'Audit', admin: true },
      { href: '/trash', label: 'Koš', admin: true },
    ],
  },
  {
    label: 'Účet',
    items: [
      { href: '/extension', label: 'Rozšíření' },
      { href: '/settings', label: 'Nastavení' },
      { href: '/companies', label: 'Firmy' },
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @tt/web test -- nav.test`

Expected: PASS — all seven test cases green.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @tt/web typecheck`

Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/nav.ts apps/web/src/app/\(authenticated\)/nav.test.ts
git commit -m "feat(web): nav grouping helper with admin-aware filtering"
```

---

## Task 2: Render grouped sidebar in the authenticated layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

- [ ] **Step 1: Replace the inline nav data and flat render with grouped output**

Replace the entire current contents of `apps/web/src/app/(authenticated)/layout.tsx` with:

```tsx
import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { FaviconSwitcher } from '@/components/FaviconSwitcher';
import { LogoutButton } from '@/components/LogoutButton';
import { filterVisibleGroups, navGroups } from './nav';

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const session = await requireUser();
  const isAdmin = session.activeRole === 'admin';
  const visibleGroups = filterVisibleGroups(navGroups, isAdmin);

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
        <nav className="px-3">
          {visibleGroups.map((group, index) => (
            <div key={group.label} className={index === 0 ? '' : 'mt-5'}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
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
```

The change footprint vs. previous version:

1. Removed the inline `navItems` array (lines 16–29 of the old file).
2. Added `import { filterVisibleGroups, navGroups } from './nav';`.
3. Added `const visibleGroups = filterVisibleGroups(navGroups, isAdmin);`.
4. Replaced the flat `<nav>...{navItems.filter(...).map(...)}</nav>` with the grouped render shown above.

Everything outside the `<nav>` block (header bar, CompanySwitcher container, footer with user info, mobile header, main) is byte-identical to the prior file.

- [ ] **Step 2: Typecheck the web app**

Run: `pnpm --filter @tt/web typecheck`

Expected: PASS — no errors. (If you see `Cannot find module './nav'`, Task 1 was not committed; go back and finish it.)

- [ ] **Step 3: Run unit tests**

Run: `pnpm --filter @tt/web test`

Expected: PASS — including the seven cases added in Task 1, plus existing service tests.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @tt/web lint`

Expected: PASS — no new lint errors.

- [ ] **Step 5: Smoke test in the browser as an admin**

Start the dev server (or note that it's already running):

```bash
pnpm --filter @tt/web dev
```

Open http://localhost:3000 in a browser, sign in as an admin user.

Verify in the left sidebar:

- Five uppercase section labels appear in this order: `SLEDOVÁNÍ`, `PŘEHLEDY`, `SPRÁVA DAT`, `SYSTÉM`, `ÚČET`.
- All twelve nav links are present, grouped under the labels exactly as in the spec table.
- The first label sits flush below the `CompanySwitcher` (no extra top margin); subsequent labels have visible breathing room above them.
- Hovering an item produces the same `bg-zinc-100` background as before.
- Clicking each link still navigates to the correct page.

If any of the above fails, fix in `layout.tsx` and re-run from Step 2.

- [ ] **Step 6: Smoke test as a non-admin user**

Sign out, then sign in as a non-admin user (a regular member of a company).

Verify in the sidebar:

- Exactly three section labels render: `SLEDOVÁNÍ`, `SPRÁVA DAT`, `ÚČET`. The `PŘEHLEDY` and `SYSTÉM` labels are absent — there is no orphan label without items.
- Under `SPRÁVA DAT` only `Štítky` appears (Klienti and Členové are admin-only and hidden).
- Under `SLEDOVÁNÍ`: `Stopky`, `Výkaz`.
- Under `ÚČET`: `Rozšíření`, `Nastavení`, `Firmy`.
- Visual rhythm — labels above items, ~20px of vertical breathing room between sections — looks consistent across the three groups.

- [ ] **Step 7: Mobile smoke test**

Resize the browser to <768px width (or open dev tools and toggle device emulation to a phone size).

Verify:

- The sidebar disappears (it was already `hidden ... md:block` and that hasn't changed).
- The mobile header at the top of `<main>` still shows the "Time Tracker" link and logout button.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat(web): group sidebar nav into labeled sections"
```

---

## Verification summary

After both tasks are complete:

```bash
pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test
```

Expected: all three commands exit 0. Manual browser smoke test in Task 2 Steps 5–7 covers admin, non-admin, and mobile rendering.
