# Mobile layout & responsiveness

How the web app adapts from 360px phones to desktop. Implemented 2026-06.

See the design spec: [`docs/superpowers/specs/2026-06-02-responsive-app-design.md`](../superpowers/specs/2026-06-02-responsive-app-design.md).

## Breakpoint model

One primary switch at Tailwind `md` (768px). Below `md` = "mobile shell"; at/above = desktop.

| Width   | Shell nav                   | Tables                     | Forms / grids              |
| ------- | --------------------------- | -------------------------- | -------------------------- |
| `< 768` | Bottom tab bar + More sheet | Stacked cards (`DataCard`) | 1 col, full-width controls |
| `≥ 768` | Sidebar                     | `<table>`                  | desktop layout             |

`sm` (640px) is used for intra-component refinement (e.g. 2-up date inputs).

## Z-index scale (single source of truth — mirrored in `apps/web/src/app/globals.css`)

| Layer                                     | z      |
| ----------------------------------------- | ------ |
| Desktop sticky sidebar                    | `z-10` |
| In-page sticky headers                    | `z-20` |
| Mobile bottom tab bar + mobile top header | `z-30` |
| Open custom popovers (`MultiSelect`)      | `z-40` |
| Modals + More sheet (backdrop & panel)    | `z-50` |

Native `<select>` (incl. `CompanySwitcher`) needs no z-index — the browser paints its dropdown on top.

## Bottom-bar / safe-area contract

- Root layout (`app/layout.tsx`) exports `viewport` with `viewportFit: 'cover'`.
- The mobile bar is `fixed bottom-0 h-[var(--tab-bar-height)]` (56px) with `pb-[env(safe-area-inset-bottom)]`.
- Authenticated `<main>` reserves clearance: `pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] md:pb-8`.
- The mobile header has `pt-[env(safe-area-inset-top)]`.

## Bottom tab bar

`getBottomTabs(isAdmin)` (in `app/(authenticated)/nav.ts`) returns the first 4 visible items in `BOTTOM_BAR_ORDER`; the rest, plus the company switcher, theme toggle, profile, and logout, live in the More sheet (`getMoreGroups`). Admin: Stopky · Reporty · Klienti · Členové. Non-admin: Stopky · Štítky · Nastavení · Firmy. Components: `BottomTabBar.tsx`, `MoreSheet.tsx`, glyphs in `components/nav-icons.tsx`.

## Table → card pattern

`<div className="hidden md:block"><Table>…</Table></div>` (the `Table` primitive has its own bordered wrapper, so `hidden` goes on the outer div) + a sibling `<ul className="space-y-3 md:hidden">` of `DataCard`s (`packages/ui/src/data-cards.tsx`). Card field labels reuse the table's column-header strings.

## Verification

`apps/web/tests/e2e/responsive.spec.ts` — a Playwright matrix over 360 / 768 / 1280 asserting no horizontal overflow on every authenticated route, the mobile tab bar visible at 360 (hidden at desktop), the More sheet exposing company switch + logout, and the members table→card switch. Runs in CI.

## Manual device checklist (per release touching layout)

- [ ] iOS Safari: bottom bar clears the home indicator (safe-area); header clears the notch.
- [ ] More sheet: focus trap, `Esc`/backdrop closes, body doesn't scroll behind it.
- [ ] No horizontal scroll on any page at 360px.
- [ ] Tap targets ≥ 40px (row actions, clear buttons, swatches).
