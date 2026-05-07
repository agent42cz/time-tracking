# SIDEBAR-01 — Changelog

## Outcome

Sidebar nav grouped into five labeled sections (Sledování, Přehledy, Správa dat, Systém, Účet) with admin-aware filtering. Empty sections are hidden so non-admins see no orphan labels.

## Files

- **Created:** `apps/web/src/app/(authenticated)/nav.ts` — `NavItem` / `NavGroup` types, `navGroups` constant, `filterVisibleGroups` pure helper.
- **Created:** `apps/web/src/app/(authenticated)/nav.test.ts` — seven Vitest cases covering admin/non-admin/empty-group/non-mutation.
- **Modified:** `apps/web/src/app/(authenticated)/layout.tsx` — replaced flat `navItems` array + `.map` render with grouped JSX consuming `filterVisibleGroups(navGroups, isAdmin)`.

No new dependencies.

## Tests

7 added, all green:

- `navGroups contains all 12 nav items across 5 groups in expected order`
- `navGroups lists items in the spec-defined order within each group`
- `filterVisibleGroups returns all five groups with all items for admin`
- `filterVisibleGroups drops Přehledy and Systém for non-admin (all-admin groups)`
- `filterVisibleGroups keeps Správa dat with only Štítky for non-admin`
- `filterVisibleGroups keeps Sledování and Účet intact for non-admin`
- `filterVisibleGroups drops a group whose every item is admin-only when caller is not admin`
- `filterVisibleGroups does not mutate the input array`

## Commits

```
23aaceb feat(web): nav grouping helper with admin-aware filtering
53dd8bc feat(web): group sidebar nav into labeled sections
4d841ed fix(web): scope sidebar footer positioning and tidy first-group className
1834651 style(web): accent sidebar section labels and add dividers
```

## Deviations from plan

- The original spec said "no new files." The plan and the shipped implementation added two small co-located files (`nav.ts` ~30 lines, `nav.test.ts` ~50 lines) so the visibility rules get covered by automated tests instead of relying solely on manual smoke. The `layout.tsx` change itself remained a ~25-line edit, in line with the spec.
- After initial merge, follow-up commits (`4d841ed`, `1834651`) tightened the footer positioning and added small visual accents (section dividers, subtle label styling). These are within the original visual treatment described in the plan.

## Verification

`pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test` — all green.

Manual smoke completed for admin, non-admin, and mobile (`<md`).
