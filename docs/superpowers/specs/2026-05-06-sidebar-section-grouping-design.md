# Sidebar Section Grouping

**Date:** 2026-05-06
**Scope:** `apps/web/src/app/(authenticated)/layout.tsx`

## Problem

The authenticated sidebar renders 12 nav items as a single flat list. Admins see all 12; regular users see 5. Even at 5 items the list reads as an undifferentiated wall, and at 12 it is hard to scan and group mentally.

## Goal

Reduce cognitive load by splitting the nav into labeled sections that match how users think about the features (tracking work, viewing reports, managing data, system tools, account settings).

## Design

### Section grouping

Five labeled groups in this render order:

| Section label | Items                                        | Notes                                                           |
| ------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `Sledování`   | Stopky, Výkaz                                | Always visible                                                  |
| `Přehledy`    | Dashboard, Reporty                           | Both items admin-only — entire section hidden for regular users |
| `Správa dat`  | Klienti `[admin]`, Štítky, Členové `[admin]` | Regular users see only Štítky                                   |
| `Systém`      | Audit, Koš                                   | Both items admin-only — entire section hidden for regular users |
| `Účet`        | Rozšíření, Nastavení, Firmy                  | Always visible                                                  |

### Empty-section rule

If, after admin-filtering, a section has zero visible items, the section label and the section itself are not rendered. With current admin flags this affects `Přehledy` and `Systém` for regular users. The same logic applies generically — if the item set ever changes, no special-casing is needed.

### Visual treatment

Section labels:

- `text-[11px] font-semibold uppercase tracking-wider text-zinc-500`
- `px-3` (aligns the label baseline with item label baseline)
- `mt-5` to separate from the previous group; the first rendered section uses `mt-0` so the first label sits flush under `CompanySwitcher`
- `mb-1` to give the first item slight breathing room below the label

Items: unchanged from current styling — `block rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900`.

No horizontal divider lines — label + spacing carries enough visual weight, and hairlines would feel heavy across five groups.

### Data shape

Replace the flat `navItems` array with a `navGroups` array:

```ts
type NavItem = { href: string; label: string; admin?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Sledování',
    items: [
      /* … */
    ],
  },
  {
    label: 'Přehledy',
    items: [
      /* … */
    ],
  },
  {
    label: 'Správa dat',
    items: [
      /* … */
    ],
  },
  {
    label: 'Systém',
    items: [
      /* … */
    ],
  },
  {
    label: 'Účet',
    items: [
      /* … */
    ],
  },
];
```

Render: map groups → filter items by `!item.admin || isAdmin` → if filtered items is empty, skip the group; otherwise render the label followed by the items.

### Mobile behavior

Unchanged. The sidebar remains hidden on `<md` breakpoints and a slim header is shown instead. This change does not introduce a mobile drawer.

### Accessibility

Each section is wrapped in a `<div>` with the label rendered as a non-interactive `<p>` (styled like a small caps heading) above the items. We avoid `<h2>`/`<h3>` to keep the page heading hierarchy clean — sidebar group labels are visual scaffolding, not document structure. The existing `<nav>` wraps the whole list. No links are added or removed.

## Out of scope

- Mobile drawer or hamburger menu
- Collapsing groups by user action
- Icons next to nav items
- Reordering items within a group beyond what the table above defines
- Renaming any of the existing nav items themselves

## Implementation footprint

Single-file change: `apps/web/src/app/(authenticated)/layout.tsx`. Approximately 25 lines of JSX restructured. No new components, no new files, no new dependencies.

## Verification

- Sign in as admin — confirm all five sections render in the order above with their items.
- Sign in as a regular user — confirm only `Sledování`, `Správa dat` (Štítky only), and `Účet` render; `Přehledy` and `Systém` are absent (no orphan label).
- Hover and focus states on items remain identical to current.
- Mobile view (`<md`) still hides the sidebar and shows the existing header.
