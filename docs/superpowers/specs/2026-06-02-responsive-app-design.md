# Full responsiveness (360px → desktop)

- **Date:** 2026-06-02
- **Status:** Approved (pre-implementation)
- **Scope:** `apps/web` (the Next.js web app) + shared `packages/ui` primitives
- **New user stories:** none — this is a cross-cutting quality pass, not a feature. Tracked as a responsiveness epic; no US-coverage change.
- **New ADR:** none expected. Tech stack stays locked (no icon library added — see §6.1). If we end up adding a dependency, that gets its own ADR.
- **Source audit:** 147 findings (42 high / 52 medium / 36 low) from a parallel responsiveness audit, 2026-06-02. Raw findings archived with the task record.

## 1. Problem

The web app is effectively **desktop-only**. Concrete evidence:

- **No mobile navigation at all.** The authenticated shell (`app/(authenticated)/layout.tsx`) renders the sidebar as `hidden … md:flex`, and the mobile header (`md:hidden`) contains **only the logo + a logout button**. Below 768px a user **cannot reach any other page** — not Reporty, not Klienti, not Nastavení, and **cannot switch companies** (the `CompanySwitcher` lives only in the sidebar). This is a hard functional break, not polish.
- **No viewport meta.** `app/layout.tsx` exports no `viewport`, so mobile browsers fall back to a ~980px layout viewport and zoom out — every page renders shrunk.
- **Tables clip.** The shared `Table` wrapper (`packages/ui/src/table.tsx:6`) uses `overflow-hidden`, so the wide data tables (reports, members, clients, companies, audit, trash, api-tokens) are **cut off** on phones with no scroll and no alternative layout.
- **58 of 67 component files use zero responsive classes.** Fixed widths (`w-64`, `w-32`), non-wrapping flex rows, side-by-side form inputs, and sub-40px touch targets are pervasive.

## 2. Goals / non-goals

**Goals**

- Every page usable and legible from **360px** (small phones) through tablets to large desktop.
- A real **mobile navigation**: a fixed **bottom tab bar** (4 primary destinations + **More**) replacing the dead mobile header, with a **More sheet** that also exposes the company switcher, theme toggle, profile, and logout.
- Wide data tables become **stacked cards** below `md`.
- Shared **UI primitives** (table, button, card, modal, inputs) carry the bulk of the fixes so individual pages need minimal, consistent changes.
- **No horizontal page overflow** at any supported width.
- Verified with an automated **Playwright viewport matrix** + a documented manual pass.

**Non-goals (YAGNI)**

- The **Chrome extension** (`apps/extension`) — its popup is a fixed-size MV3 surface, not a responsive web page. Out of scope.
- Adding an **icon library** (lucide/heroicons). Bottom-bar icons are inline SVGs in one module — no new dependency, no ADR (§6.1).
- **Tablet-specific** redesigns (e.g. a slimmer sidebar at 768–1024px). We keep the single `md` switch; tablet portrait is verified but not bespoke-designed.
- Any **behavioural / data** changes. This is layout/presentation only. Every existing test must still pass; no audit-row semantics change.
- Re-theming, dark-mode rework, or animation polish beyond what the sheet/drawer needs.

## 3. Breakpoint model

Mobile-first, **one primary switch at Tailwind `md` (768px)**, with `sm` (640px) used for intra-component refinement.

| Width            | Shell nav                   | Tables         | Forms / grids                                            |
| ---------------- | --------------------------- | -------------- | -------------------------------------------------------- |
| `< 640` (`base`) | Bottom tab bar + More sheet | Stacked cards  | 1 column, full-width controls, buttons may go full-width |
| `640–767` (`sm`) | Bottom tab bar + More sheet | Stacked cards  | 2-up where it fits (e.g. date/from/to)                   |
| `≥ 768` (`md`)   | Desktop sidebar             | Real `<table>` | Current desktop layout                                   |

Rationale for a single switch: it keeps the mental model simple, matches the existing `md:flex` sidebar boundary already in the code, and means "is this the mobile shell?" has exactly one answer. Verified breakpoints: **360 / 390 / 414 / 640 / 768 / 1024 / 1280**.

## 4. Architecture

The work is four layers. Layers 1–2 are **foundational and unblock everything**; do them first.

```
1. Foundation     viewport meta · safe-area vars · z-index scale · global bottom-bar spacing
2. Shell nav      BottomTabBar + MoreSheet · nav.ts primary/icon model · sidebar/header refactor
3. Primitives     Table (scroll + DataCards) · Button · Card · ConfirmModal · inputs
4. Per-page       timer · reports/dashboard · admin data · audit/trash · settings · public/auth
```

### 4.1 Foundation

**`app/layout.tsx`** — add the viewport export (Next 15 App Router API):

```ts
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // enables env(safe-area-inset-*) on notched phones
};
```

**`app/globals.css`** — add a documented spacing + layering layer (kept alongside the existing dark-mode convention comment):

```css
:root {
  --tab-bar-height: 3.5rem; /* 56px — bottom tab bar */
}

/* Long unbreakable tokens (otpauth URIs, chrome.storage.local) must never cause
   horizontal overflow. */
code,
pre {
  overflow-wrap: anywhere;
}
```

Safe-area insets are consumed inline via `env(safe-area-inset-*)` (Tailwind arbitrary values), not redefined as custom props — simpler and avoids a redundant indirection.

**Z-index scale** (documented in `globals.css` and `docs/architecture/mobile-layout.md`; the single source of truth for stacking):

| Layer                                     | z      | Notes                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Desktop sticky sidebar                    | `z-10` | `md+` only                                                                     |
| In-page sticky headers                    | `z-20` | table `thead`, day-group headers                                               |
| Mobile bottom tab bar + mobile top header | `z-30` |                                                                                |
| Open popovers / dropdowns                 | `z-40` | `Select`, `MultiSelect`, `CompanySwitcher` — must sit **above** the bottom bar |
| Modals + More sheet (backdrop & panel)    | `z-50` | top of everything                                                              |

> Note: today `MultiSelect`/dropdowns use `z-20`. They must move to `z-40` so an open dropdown near the bottom of the screen is not occluded by the `z-30` tab bar.

**Global bottom-bar spacing** (in `app/(authenticated)/layout.tsx`): the authenticated `<main>` reserves space so content never hides behind the fixed bar:

```
pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] md:pb-8
```

Main padding also drops to `px-4 py-6 sm:px-6 sm:py-8` (the current `px-6 py-8` wastes width on phones).

### 4.2 Shell navigation — bottom tab bar + More sheet

**`nav.ts` gains a priority order + icons.** Extend the model so the bottom bar can pick role-appropriate primary tabs deterministically:

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

// Priority order for the mobile bottom bar (highest first). The bar shows the
// first 4 *visible* (role-filtered) items; the rest fall into the More sheet.
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

export function getBottomTabs(isAdmin: boolean): NavItem[]; // first 4 visible, in BOTTOM_BAR_ORDER
export function getMoreGroups(isAdmin: boolean): NavGroup[]; // visible groups minus the 4 primary items
```

Resulting bars:

- **Admin:** Stopky · Reporty · Klienti · Členové · **Více**
- **Non-admin** (visible set = Stopky, Štítky, Nastavení, Firmy, Rozšíření): Stopky · Štítky · Nastavení · Firmy · **Více**

**`BottomTabBar`** (new client component, `md:hidden`, `fixed inset-x-0 bottom-0 z-30`, `pb-[env(safe-area-inset-bottom)]`):

- 4 tabs (icon + short label) + a **More** tab (grid/▦ icon).
- Active state from `usePathname()` (active tab tinted indigo to match sidebar accents).
- Each tab ≥ 44px tall; full row height `var(--tab-bar-height)`.

**`MoreSheet`** (new client component) — a bottom sheet opened by the More tab (`z-50` per the scale — backdrop dims, panel slides up). The `CompanySwitcher` dropdown rendered inside it stacks within the sheet's own stacking context, so its `z-40` is relative to the sheet, not the global layer. Contents, top to bottom:

1. **Profile header** — full name, email, active role (the info currently hidden on mobile).
2. **CompanySwitcher** (restores company switching on mobile).
3. **Remaining nav** (the `getMoreGroups` output, grouped as in the sidebar).
4. **ThemeToggle** (compact) — currently there is _no_ in-app way to change theme; the sheet becomes its home on mobile.
5. **LogoutButton** (full-width).

Accessibility: focus trap while open, `Esc` to close, backdrop click to close, `aria-modal`, `aria-label`, body scroll lock, `prefers-reduced-motion` respected for the slide animation. Closes on route change.

**`app/(authenticated)/layout.tsx` refactor:**

- Keep the sidebar `hidden md:flex` (unchanged on desktop).
- Replace the dead mobile header content: keep a slim sticky top header (logo only, `pt-[env(safe-area-inset-top)]`, `z-30`) — logout/profile/switcher all move into the More sheet, so the header no longer needs them.
- Mount `<BottomTabBar />` (and its `MoreSheet`) for `md:hidden`.
- Add the `<main>` bottom padding + safe-area from §4.1.
- Add `focus-visible:ring` to sidebar nav links (a11y gap surfaced by the audit).

### 4.3 Tables → scroll + stacked cards

**`packages/ui/src/table.tsx`** — stop clipping:

```
overflow-hidden  →  overflow-x-auto md:overflow-hidden
```

This is the safety net (any table without a card view becomes horizontally scrollable instead of clipped).

**New `packages/ui/src/data-cards.tsx`** — a tiny shared primitive so all ~6 tables get **one consistent** mobile card style instead of 6 bespoke variants:

```tsx
// Renders a labelled list of fields as a card; an optional actions footer.
export function DataCard({ children }): ReactElement; // bordered card container
export function DataCardRow({ label, children }): ReactElement; // <dt>/<dd> label–value line
export function DataCardActions({ children }): ReactElement; // right-aligned/stacked footer
```

**Per-table pattern** (applied to reports `ReportGrouped`, members + pending-invites, companies, audit, trash, api-tokens):

```tsx
<table className="hidden w-full md:table"> … existing rows … </table>
<ul className="space-y-3 md:hidden">
  {rows.map((r) => (
    <li key={r.id}>
      <DataCard>
        <DataCardRow label={t('col.client')}>{r.client}</DataCardRow>
        {/* …key fields… */}
        <DataCardActions>{/* row actions */}</DataCardActions>
      </DataCard>
    </li>
  ))}
</ul>
```

Card field labels reuse the existing column header i18n keys — no duplicate strings.

### 4.4 Primitive fixes (resolve ~34 findings at the source)

| File                                                     | Change                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`                                             | Remove `shrink-0` (blocks wrapping/shrinking in tight rows). Keep `sm/md/lg`; reserve `sm` (32px) for desktop-dense contexts only.                                                                                                                                              |
| `confirm-modal.tsx`                                      | `max-w-md` → `w-[calc(100vw-1.5rem)] max-w-md`; outer `px-4` → `px-3 sm:px-4`; footer `flex … justify-end` → `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` (stacked, full-width buttons on phones); scroll body if it exceeds viewport height; `z-50` per the scale. |
| `card.tsx`                                               | Responsive padding `px-4 py-3 sm:px-5 sm:py-4` (header/body/footer); header `flex-col sm:flex-row` so title+action stack on phones; footer stacks like the modal footer.                                                                                                        |
| `search-input.tsx`                                       | Clear button `h-6 w-6` → `h-9 w-9` (icon stays small inside a larger hit area).                                                                                                                                                                                                 |
| `empty-state.tsx`                                        | `px-6 py-12` → `px-4 sm:px-6 py-8 sm:py-12`.                                                                                                                                                                                                                                    |
| `select.tsx` / `MultiSelect.tsx` / `CompanySwitcher.tsx` | Open popovers → `z-40`; popover `max-w-[calc(100vw-2rem)]`; dropdown `max-h-[min(16rem,70vh)]`; long option labels `break-words`.                                                                                                                                               |
| `PageHeader.tsx`                                         | Title `text-lg sm:text-xl`; container `flex-col gap-2 sm:flex-row sm:items-end sm:justify-between`.                                                                                                                                                                             |

## 5. Per-area changes

Each row is a concrete, audit-sourced fix. Severity in parentheses. Full per-line detail lives in the archived audit; this is the actionable digest the plan will expand into tasks.

### 5.1 Timer (Stopky) — `app/(authenticated)/timer/*`, `components/time/*`, `MultiSelect`

- **RunningTimers / TimerHistory rows (high):** `flex items-center justify-between` → `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`; the time + action cluster moves to its own row on phones.
- **Row action buttons — Edit/Stop/Play/Delete (high):** icon buttons to `h-10 w-10` tap area on mobile (`sm:h-8 sm:w-8`); consider an overflow menu if a row has 3+ actions.
- **TimerStartCard form grids (med):** `md:grid-cols-3` → `grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3`; picker row `md:grid-cols-2` → `sm:grid-cols-2`; submit `w-full sm:w-auto`.
- **MultiSelect (med):** popover width cap + `max-h` (folded into the primitive fix above); collapse to "N vybráno" summary when chips would wrap on phones.
- **Page rhythm (low):** `space-y-6` → `space-y-4 md:space-y-6`; tag pills `py-1 md:py-0.5` for tap size.

### 5.2 Reports + Dashboard — `app/(authenticated)/reports/*`, `dashboard/page.tsx`

- **ReportGrouped table (high):** table→cards per §4.3 (Datum, Uživatel, Klient, Projekt, Popis, Štítky, Čас, Akce).
- **Export button row (high):** `flex flex-wrap` → `flex flex-col sm:flex-row`, buttons `w-full sm:w-auto`.
- **ReportFiltersForm (high×2):** date-preset buttons in a `flex flex-wrap gap-2` (or horizontal-scroll strip on phones); custom-range row `flex-col sm:flex-row`, date inputs `w-full sm:w-auto`; group-by + "jen moje" row `flex-col sm:flex-row`; action row `flex-col sm:flex-row sm:justify-between`.
- **Dashboard secondary grid (high):** `grid-cols-1 lg:grid-cols-2` → add `md:grid-cols-2`.
- **Dashboard client-share rows (high):** fixed `w-32` label → `w-20 sm:w-32` (or stack label/bar on phones).
- **Dashboard daily breakdown (med):** wrap the dynamic N-column grid in `overflow-x-auto`; bump dense cell text `text-[11px] sm:text-[10px]`.

### 5.3 Admin data — members, clients, companies, tags

- **All four tables (high):** members, pending-invites, companies → cards per §4.3.
- **ClientRow / ProjectRow (high):** header `flex justify-between` → stack actions below info on phones (`flex-col sm:flex-row`); truncate long names; inline rename/add-project forms `flex-col gap-1 sm:flex-row`, input `w-full sm:max-w-xs`.
- **Inline create forms (med):** clients "new", tags "new", members invite — `flex gap-2` → `flex flex-col gap-2 sm:flex-row`.
- **Color swatches (med):** tag palette `h-6 w-6`/`h-4 w-4` → `h-8 w-8` for tap size; swatch row wraps cleanly.

### 5.4 Audit + Trash — `audit/page.tsx`, `trash/TrashList.tsx`, `extension/page.tsx`

- **Audit table (high) & Trash table (high):** → cards per §4.3; restore action in the card footer.
- **Audit filter form (med):** stack `flex-col md:flex-row`, inputs `w-full md:w-auto`.
- **Timestamps (low):** date-only on phones via `hidden sm:inline` / `sm:hidden` spans.
- **Extension page (med):** intro `flex flex-wrap` → `flex flex-col md:flex-row`; ordered-list `pl-3 sm:pl-5`.

### 5.5 Settings + API tokens — `settings/*`, `settings/api-tokens/*`

- **Token table (high):** → cards per §4.3 (name, company, created, last-used, status, revoke).
- **CardHeader with action button (high):** `flex-col sm:flex-row` so the "Create token" button drops below the title on phones (also fixed at the `card.tsx` primitive level).
- **TotpManager QR (med):** `width/height={224}` → responsive `max-w-[180px] sm:max-w-[224px]`; secret/otpauth blocks `overflow-wrap:anywhere` (covered globally); recovery-codes grid `grid-cols-1 sm:grid-cols-2`.
- **CreateTokenDialog (med):** padding `p-4 sm:p-6`; copy/download buttons `flex-col sm:flex-row`, `w-full sm:w-auto`.

### 5.6 Public / auth — login, reset, invite, privacy, extension/connect

- **`py-12` wrappers (med, 6 pages):** → `py-4 sm:py-8 md:py-12` (excess top/bottom padding pushes forms off-screen on short mobile viewports). Centralize via a shared `<AuthPageShell>` wrapper so it's one change, not six.
- **LoginForms (med):** mode-toggle buttons `py-1.5` → `py-2` (tap size); TOTP input `text-lg` → `text-base sm:text-lg`.
- **InviteAcceptForm (med):** email + role line `inline` → `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` (long emails overflow today).
- **ResetPasswordForm (low):** success-state link → shared `Button` (consistent 40px height).
- **privacy / ConnectBridge (low):** inline `<code>` wrapping handled by the global `overflow-wrap` rule.

## 6. New files & i18n

### 6.1 New files

- `apps/web/src/app/(authenticated)/BottomTabBar.tsx` — client component (tab bar).
- `apps/web/src/app/(authenticated)/MoreSheet.tsx` — client component (overflow sheet). May share a small internal `Sheet` shell.
- `apps/web/src/components/nav-icons.tsx` — inline SVG registry keyed by `NavIcon` (no icon-library dependency, so no ADR; matches the app's existing "hand-rolled glyphs" approach).
- `apps/web/src/components/AuthPageShell.tsx` — shared centered wrapper for public/auth pages (kills the repeated `py-12`).
- `packages/ui/src/data-cards.tsx` — `DataCard` / `DataCardRow` / `DataCardActions`; exported from `packages/ui/src/index.ts`.
- `docs/architecture/mobile-layout.md` — breakpoint model, z-index scale, bottom-bar/safe-area contract, table→card pattern.

### 6.2 i18n (cs.json — Czech UI is mandatory, never hardcode)

- `nav.more` = **"Více"**
- `nav.menu.aria` (open-menu aria-label), `nav.close.aria`, `nav.tabbar.aria`
- `nav.profile.role` label inside the sheet (reuse existing role labels if present)
- Card field labels reuse existing table-column keys — **no new strings** for the table→card conversion.

## 7. Testing & verification

Per the constitution: real Postgres + Redis via testcontainers for anything touching data; these changes are presentational, so the new automated coverage is **Playwright E2E** (the existing E2E harness in `apps/web/tests/e2e/`).

**Viewport matrix** — a Playwright spec parametrised over `[360, 768, 1280]` asserting, for each authenticated route:

1. **No horizontal overflow:** `document.documentElement.scrollWidth <= clientWidth` (the single highest-signal responsiveness assertion).
2. **Nav reachability (360px):** bottom tab bar visible; every nav destination reachable via a primary tab or the More sheet; company switcher present in the sheet.
3. **Table→card switch:** at 360px the `md:table` is hidden and the card list is shown; at 1280px the inverse.
4. **Modal fits:** open a `ConfirmModal` at 360px → its box width ≤ viewport.

**Regressions:** existing unit/integration tests (including `nav.test.ts`) must stay green; extend `nav.test.ts` for `getBottomTabs`/`getMoreGroups` (admin vs non-admin selection). No change to `auditCount()` expectations — no behavioural change.

**Manual pass:** real iOS Safari + Android Chrome smoke (notch safe-area, sheet focus trap, no body scroll behind sheet) — documented as a checklist in `mobile-layout.md`.

**Gates:** `pnpm lint && pnpm typecheck && pnpm build && pnpm test` plus the new E2E spec. `pnpm test:trace` stays at 100% (no US change).

## 8. Rollout / phasing

Sequenced so each phase is independently shippable and the highest-impact fix lands first:

1. **Foundation + shell nav** (§4.1–4.2) — viewport, safe-area, z-index, bottom tab bar + More sheet, `nav.ts`. _This alone restores mobile usability_ (navigation + company switch + theme + logout). Ship behind nothing; it's strictly additive on desktop.
2. **Primitives** (§4.4) + **Table→cards plumbing** (§4.3) — the shared layer the per-page work builds on.
3. **Per-area sweep** (§5) — timer → reports/dashboard → admin data → audit/trash → settings → public/auth. Each area is its own commit with its slice of the Playwright matrix.
4. **Verification & docs** — full viewport matrix green, `mobile-layout.md`, manual device pass.

## 9. Open questions / risks

- **Bottom-bar primary set** is role-derived (first 4 visible in `BOTTOM_BAR_ORDER`). If product later wants a fixed admin set regardless of role, that's a one-line order/flag change — the model supports it.
- **Daily-breakdown chart on dashboard** (§5.2) is the one genuinely dense widget; horizontal scroll is the v1 answer. A mobile-specific reduced-range view is a possible follow-up, explicitly deferred.
- **`sm` (640px) intra-component 2-up layouts** are a judgement call per form; the plan will pick per-case, defaulting to single-column when in doubt.

```

```
