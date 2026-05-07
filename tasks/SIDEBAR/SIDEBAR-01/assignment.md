# SIDEBAR-01: Sidebar section grouping

## What

Replace the flat 12-item sidebar in `apps/web/src/app/(authenticated)/layout.tsx` with five labeled sections (Sledování, Přehledy, Správa dat, Systém, Účet). Auto-hide sections that have no visible items for the current user (admin-filtered).

## Why

The authenticated sidebar rendered 12 nav items as a single flat list. Admins saw all 12; regular users saw 5. Even at 5 items the list reads as an undifferentiated wall, and at 12 it is hard to scan and group mentally. Splitting into labeled sections that match how users think about the features (tracking work, viewing reports, managing data, system tools, account settings) reduces cognitive load.

## Acceptance criteria

- [x] Five labeled sections render in this order for admins: Sledování, Přehledy, Správa dat, Systém, Účet.
- [x] Empty-section rule: if a section has zero visible items after admin-filtering, the section label and the section itself do not render.
- [x] Non-admin users see only Sledování, Správa dat (Štítky only), and Účet — no orphan labels.
- [x] Section labels styled `text-[11px] font-semibold uppercase tracking-wider text-zinc-500`, `px-3`, with `mt-5` separation between groups (first group `mt-0`).
- [x] Item styling unchanged from prior layout.
- [x] No new dependencies.
- [x] Mobile behavior unchanged (sidebar hidden `<md`).

## Section grouping (final spec)

| Section      | Items                                        | Notes                                                           |
| ------------ | -------------------------------------------- | --------------------------------------------------------------- |
| `Sledování`  | Stopky, Výkaz                                | Always visible                                                  |
| `Přehledy`   | Dashboard, Reporty                           | Both items admin-only — entire section hidden for regular users |
| `Správa dat` | Klienti `[admin]`, Štítky, Členové `[admin]` | Regular users see only Štítky                                   |
| `Systém`     | Audit, Koš                                   | Both items admin-only — entire section hidden for regular users |
| `Účet`       | Rozšíření, Nastavení, Firmy                  | Always visible                                                  |

## Out of scope

- Mobile drawer or hamburger menu.
- User-collapsible groups.
- Icons next to nav items.
- Reordering items within a group beyond what the table above defines.
- Renaming any of the existing nav items themselves.

## Dependencies

None.

## Notes

- Single-file change planned; bumped to two small files (`nav.ts`, `nav.test.ts`) so the visibility rules are locked in by automated tests rather than relying solely on manual smoke. The `layout.tsx` change itself remains a ~25-line edit.
- Accessibility: section is wrapped in a `<div>` with the label rendered as a non-interactive `<p>`. We avoid `<h2>`/`<h3>` to keep page heading hierarchy clean — sidebar group labels are visual scaffolding, not document structure.
