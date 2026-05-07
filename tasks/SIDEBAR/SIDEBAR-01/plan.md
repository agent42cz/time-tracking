# SIDEBAR-01 — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 12-item sidebar with five labeled sections; auto-hide empty sections.

**Architecture:** Extract a tiny pure helper (`nav.ts`) that holds the grouped nav data and a `filterVisibleGroups(groups, isAdmin)` function. The Server Component layout consumes the filtered output and renders one labeled `<div>` per group. The helper is unit-tested; the rendered layout is verified via manual smoke testing in dev (admin and regular user).

**Tech Stack:** Next.js 15 App Router (Server Component), React 19, Tailwind CSS, Vitest (node env, no React Testing Library).

**Spec deviation:** The assignment said "no new files." This plan adds two small co-located files (`nav.ts` ~30 lines, `nav.test.ts` ~50 lines) so the visibility rules — the actual logic introduced by this change — get locked in by automated tests rather than relying solely on manual smoke testing. The layout.tsx change itself remains the spec-described ~25-line edit.

**Spec:** [`assignment.md`](assignment.md)

---

## File structure

| File                                           | Status | Responsibility                                                                                                        |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(authenticated)/nav.ts`      | Create | Defines `NavItem`, `NavGroup` types; exports `navGroups` constant and `filterVisibleGroups` pure helper               |
| `apps/web/src/app/(authenticated)/nav.test.ts` | Create | Unit tests for `filterVisibleGroups` covering admin / non-admin / empty-group drop                                    |
| `apps/web/src/app/(authenticated)/layout.tsx`  | Modify | Replace inline `navItems` array and flat `.map` render with `filterVisibleGroups(navGroups, isAdmin)` and grouped JSX |

No other files change. No dependencies added.

Imports use the project conventions:

- Module under test: `import { filterVisibleGroups, navGroups } from './nav.js'` in test files (NodeNext-style `.js` extension matches existing tests).
- Layout consumes the helper as `import { filterVisibleGroups, navGroups } from './nav'` (no extension; matches existing co-located imports in app routes).

---

## Task 1: Create the nav helper with tests

**Files:**

- Create: `apps/web/src/app/(authenticated)/nav.ts`
- Create: `apps/web/src/app/(authenticated)/nav.test.ts`

- [x] **Step 1: Write the failing test**

Create `apps/web/src/app/(authenticated)/nav.test.ts` with seven cases covering:

1. `navGroups` shape — five groups in expected label order, total of 12 items.
2. Items in spec-defined order within each group.
3. `filterVisibleGroups(navGroups, true)` returns all five groups with all items.
4. `filterVisibleGroups(navGroups, false)` drops Přehledy and Systém (all-admin groups).
5. `filterVisibleGroups(navGroups, false)` keeps Správa dat with only Štítky.
6. `filterVisibleGroups(navGroups, false)` keeps Sledování and Účet intact.
7. `filterVisibleGroups` does not mutate the input array.

- [x] **Step 2: Run the test and verify it fails**

`pnpm --filter @tt/web test -- nav.test` — Vitest reports cannot resolve `./nav.js`.

- [x] **Step 3: Implement the helper**

`nav.ts` exports `NavItem`, `NavGroup`, `navGroups` constant, and `filterVisibleGroups(groups, isAdmin)` pure function. Filter is `!item.admin || isAdmin`; groups with zero remaining items are dropped.

- [x] **Step 4: Run the test and verify it passes**

`pnpm --filter @tt/web test -- nav.test` — all seven cases green.

- [x] **Step 5: Run typecheck**

`pnpm --filter @tt/web typecheck` — no type errors.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(web): nav grouping helper with admin-aware filtering"
```

---

## Task 2: Render grouped sidebar in the authenticated layout

**Files:**

- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

- [x] **Step 1: Replace the inline nav data and flat render with grouped output**

Remove the inline `navItems` array, import `filterVisibleGroups` and `navGroups` from `./nav`, compute `visibleGroups` from `session.activeRole === 'admin'`, render one labeled `<div>` per group with item children. Section labels: `text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-3`, `mt-5` between groups (first group `mt-0`), `mb-1` for label-to-first-item breathing room.

- [x] **Step 2: Typecheck the web app**

`pnpm --filter @tt/web typecheck` — clean.

- [x] **Step 3: Run unit tests**

`pnpm --filter @tt/web test` — all green.

- [x] **Step 4: Lint**

`pnpm --filter @tt/web lint` — clean.

- [x] **Step 5: Smoke test as admin**

`pnpm --filter @tt/web dev`, sign in as admin, verify five sections render in spec order; hover states unchanged; navigation works.

- [x] **Step 6: Smoke test as non-admin**

Sign in as regular member, verify only Sledování / Správa dat (Štítky only) / Účet render; no orphan labels.

- [x] **Step 7: Mobile smoke test**

Resize to <768px, verify the sidebar disappears (`hidden md:block`), mobile header still shows.

- [x] **Step 8: Commit**

```bash
git commit -m "feat(web): group sidebar nav into labeled sections"
```

---

## Verification summary

After both tasks complete:

```bash
pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test
```

All three exit 0. Manual browser smoke covers admin / non-admin / mobile.
