# Design — Client work-fund progress bars + unassigned-label fix

- **Date:** 2026-07-09
- **Work items:** AIAGE-52 (Progress bar na hodiny klientů), AIAGE-53 („Deleted client" v dashboardu trackeru)
- **Branch:** `feat/aiage-52-53-client-work-funds`

## 1. Context & goals

Agent42 tracks time for its clients (notably **SPLY** and **SVĚT PLODŮ**) in the
self-hosted tracker. Admins need an at-a-glance view of whether the team is
meeting each client's agreed weekly/monthly hour commitment ("work fund"), in
real time, both on the web dashboard and — minimally — in the Chrome extension.

Two work items are executed together on one branch:

- **AIAGE-53** — the dashboard shows an untranslated English fallback label for
  entries that have no client/project. Small, independent relabel.
- **AIAGE-52** — the new work-fund progress-bar feature.

### Established codebase facts (from exploration)

- Roles are only `admin` | `user` (per-`Membership`). **No `manager` role.**
- The web dashboard (`apps/web/src/app/(authenticated)/dashboard/page.tsx`) is a
  static **admin-only** server component; aggregation lives in
  `apps/web/src/lib/services/dashboard.ts` (JS aggregation over `findMany`,
  `durationMs()` counts a running entry to `now`). No progress-bar primitive —
  bars are ad-hoc Tailwind. The web app is **not** a WebSocket client.
- Time attaches to a client **directly** via `TimeEntry.clientId` (nullable,
  `onDelete: SetNull`); duration derived from `startedAt`/`endedAt`.
- Extension (`apps/extension`): header at `popup.tsx:546`, existing `isAdmin`
  memo (`popup.tsx:414`); plain `fetch` REST client in `api.ts`; role union is
  `'admin' | 'user'`; **no i18n** (inline Czech). Only the extension is a WS
  client today.
- i18n on web is next-intl (`apps/web/messages/cs.json`), but the dashboard page
  currently hardcodes Czech strings inline (mid-migration).

## 2. AIAGE-53 — Unassigned-label fix

**Root cause:** `dashboard.ts` renders hardcoded English fallbacks when an entry
has no client/project (`clientId`/`projectId` is null — either never assigned or
the client/project was hard-deleted). It is an *unassigned* fallback, not truly
"deleted".

**Fix** (no schema change):

| Site | Current | New |
|------|---------|-----|
| `dashboard.ts:159` (Top projekty) | `(deleted project)` | **Nepřiřazený projekt** |
| `dashboard.ts:122` (Podíl klientů) | `(deleted client)` | **Nepřiřazený klient** |
| `dashboard.ts:221` (Daily breakdown) | `(deleted client)` | **Nepřiřazený klient** |

`reports.ts:152` already uses Czech `'Bez projektu'` — left as-is (or optionally
aligned; out of scope). Update/extend the dashboard service tests to assert the
new labels.

## 3. AIAGE-52 — Work-fund progress bars

### 3.1 Data model

Add fund config to `Client` (null/`false`/`[]` ⇒ not configured). Migration under
`packages/db/prisma/migrations/`.

```prisma
model Client {
  // … existing fields …
  fundInDashboard   Boolean @default(false)  // show its bars on dashboard + extension
  weeklyFundMinutes Int?                      // SPLY 1440 (24h), SVĚT PLODŮ 960 (16h)
  weekStartsOn      Int?                      // ISO weekday 1=Mon … 7=Sun (SPLY=3 Wed, SVĚT=1 Mon)
  workingDays       Int[]  @default([])       // ISO weekdays; SPLY [3,4,5], SVĚT [1,2]; empty = hours-only
}
```

Conventions:

- **ISO weekday**: 1=Mon … 7=Sun (avoids the JS `getDay()` 0=Sun ambiguity).
- `dailyTargetMinutes = weeklyFundMinutes / workingDays.length` when
  `workingDays` is non-empty (SPLY 1440/3 = 480 = 8h; SVĚT 960/2 = 480 = 8h).
- A client is **"working-days"** if `workingDays` is non-empty, else
  **"hours-only"** (future clients: just a weekly hour count, no promised days).

### 3.2 Aggregation service

New `clientFundProgress(db, actorUserId, companyId, now)` in `dashboard.ts`,
admin-gated like its siblings; returns `DashResult<FundProgress>`. **Team-wide**
sums (all users), `deletedAt: null`, running timers counted to `now`, Prague
zone throughout.

For each `fundInDashboard` client:

- **Weekly window** — most recent `weekStartsOn` weekday at 00:00 Prague `≤ now`,
  span 7 days `[start, start+7d)`. Add a `weekRangeFor(weekStartsOn, now)` helper
  to `@tt/shared/time` (mirrors the existing `getPeriodRange` zoning).
  - `weekly = { targetMinutes: weeklyFundMinutes, workedMinutes }`.
- **Monthly window** — existing Prague month range.
  - working-days client: `monthlyTarget = Σ(occurrences of each working weekday
    in the calendar month) × dailyTargetMinutes`.
  - hours-only client: `monthlyTarget = round(weeklyFundMinutes × daysInMonth / 7)`
    (proportional).
  - `monthly = { targetMinutes: monthlyTarget, workedMinutes }`.
- **Per-day breakdown** (working-days clients only) for the current week:
  greedily allocate the week's total worked minutes across the working days in
  order — fill day 1 up to `dailyTargetMinutes`, overflow into day 2, etc. For
  each working day:
  - `allocated` = minutes assigned to it by the greedy fill.
  - past day (before today) with `allocated < dailyTarget` → the deficit renders
    **red**, the rest **green**.
  - today / future day → **green** up to `allocated` (no red).
  This is the "hours add to Monday, and once Monday is full, Tuesday starts
  filling" behaviour.
- **Combined bar** — an extra synthetic row summing all fund clients
  (SPLY 24h + SVĚT PLODŮ 16h = 40h/week), weekly + monthly totals. Included.

Return shape (sketch):

```ts
type FundBar = { targetMinutes: number; workedMinutes: number };
type FundDay = { isoWeekday: number; targetMinutes: number; workedMinutes: number; isPast: boolean };
type ClientFund = {
  clientId: string; clientName: string;
  weekly: FundBar; monthly: FundBar;
  days: FundDay[]; // [] for hours-only
};
type FundProgress = { clients: ClientFund[]; combined: { weekly: FundBar; monthly: FundBar } };
```

### 3.3 Fund config UI (admin)

Extend the admin Clients screen
(`apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`) with a per-client
fund section: weekly hours (stored as minutes), week-start weekday, working-days
multiselect, and a "show in dashboard" toggle. New server action in
`apps/web/src/lib/actions/catalog.ts` + service in `catalog.ts`, admin-guarded,
emitting **exactly one audit row** (`auditCount()` test). Cross-company 404 test
for the mutation.

### 3.4 Web dashboard UI

New client component **"Pracovní fondy klientů"** rendered as a `Card` on the
dashboard. The server component fetches `clientFundProgress` once for initial
props (no flash); the client component then **polls** a new admin-gated route
handler **`GET /api/v1/dashboard/funds`** every ~45s (matches the current
no-WS-on-web architecture; running timers already count live). Per client:
weekly bar, monthly bar, and — for working-days clients — the per-day green/red
week strip. Plus the combined 40h/week bar. Reuses the existing Tailwind bar
markup (`page.tsx:154-159`).

Route handler returns 404 on cross-company / non-admin (existence-hiding, per
constitution). Cross-company 404 test mandatory.

### 3.5 Extension UI

Minimalistic bar inside the header (`popup.tsx:546`), gated on the existing
`isAdmin` memo. New `getFundProgress()` in `api.ts` calling the same
`/api/v1/dashboard/funds`. Rendering is driven by a new **extension-local
setting** `tt:fund-display` in `chrome.storage.local`, chosen by the user via the
popup settings/`MoreMenu`:

- `off` — hide the bar.
- `combined` — a single compact bar (today or week total across fund clients).
- `per-client` — a condensed per-day green/red week strip per fund client.

Inline Czech strings (no i18n layer in the extension).

### 3.6 Role gating

Everything **admin-only** for now: web dashboard is already admin-gated; the new
route handler re-checks admin; the extension gates on `isAdmin`. The role check
is isolated (single predicate) so introducing a future `manager` role — and
"external collaborator" plain users who see only themselves — is a localized
change, not a rewrite.

## 4. Testing

- Vitest + testcontainers (real Postgres + Redis); **no DB mocks**.
- One user-story per `it`, US id in the name.
- New service `clientFundProgress`: week/month window math (incl. Prague DST
  boundaries), team-wide summation, running-timer inclusion, greedy per-day
  allocation (partial day → green+red), hours-only (no days, proportional
  monthly), combined totals.
- New `/api/v1/dashboard/funds` route: admin success + **cross-company 404** +
  non-admin 404.
- Config mutation: persistence + **exactly one audit row** + cross-company 404.
- AIAGE-53: dashboard service returns the new Czech labels for null
  client/project.
- Playwright E2E (optional, if time): dashboard renders a fund card for a seeded
  configured client.

## 5. Implementation phasing

1. **AIAGE-53** relabel + test (independent quick win).
2. **Schema** — `Client` fund fields + migration + `prisma:generate`.
3. **Service + endpoint** — `weekRangeFor` helper, `clientFundProgress`,
   `/api/v1/dashboard/funds` route + tests.
4. **Config UI** — Clients screen fund section + action + tests.
5. **Web dashboard** — fund Card (server initial data + polling client).
6. **Extension** — header bar + `tt:fund-display` setting + `getFundProgress()`.

Each phase gated by `pnpm lint && pnpm typecheck && pnpm test`.

## 6. Decisions (resolved)

- Role: **admin-only now**, structured for a future `manager` role.
- AIAGE-53: **relabel to Czech** (Nepřiřazený projekt / Nepřiřazený klient), no
  soft-delete.
- Hours-only clients: **weekly + monthly total only** (proportional monthly), no
  per-day breakdown.
- Web real-time: **light polling** (~45s).
- Combined 40h/week bar: **included**.
- Extension display: **user-configurable** via an extension setting.
