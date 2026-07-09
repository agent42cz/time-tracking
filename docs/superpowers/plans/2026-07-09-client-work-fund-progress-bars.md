# Client Work-Fund Progress Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins real-time weekly/monthly "work fund" progress bars per client (SPLY, SVĚT PLODŮ, …) on the web dashboard and in the Chrome extension header, and relabel the untranslated "(deleted client/project)" fallback to Czech.

**Architecture:** Add fund config columns to `Client`; add a team-wide aggregation service `clientFundProgress` in the existing dashboard service; expose it via a new admin-gated `GET /api/v1/dashboard/funds` route handler. The web dashboard server-renders initial data into a `'use client'` component that polls that endpoint (~45s); the extension calls the same endpoint and renders a compact bar controlled by an extension-local setting.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Next.js 15 App Router, React 19, Prisma 6 / Postgres 16, Vitest + testcontainers (real Postgres + Redis), date-fns / date-fns-tz, Chrome MV3 (Vite + React), Tailwind.

## Global Constraints

- Package manager: **pnpm** (workspaces). Run commands from repo root unless noted.
- Tests use **real Postgres + Redis via testcontainers** — no DB mocks, ever.
- **One user-story per `it` block**; embed the US id, e.g. `it('US-90: ...')`. Use **US-90** (fund progress) and **US-91** (unassigned label) as the ids for new tests.
- **Cross-company 404** test mandatory for every read endpoint and mutation. Use 404 (not 403) to avoid existence leaks; services return `{ ok: false, reason: 'not_found' }`.
- **Every mutation produces exactly one audit row** — assert via `auditCount()` / counting `db.auditLog`.
- Czech UI. Web uses `next-intl` (`apps/web/messages/cs.json`) but the dashboard page currently hardcodes Czech inline — match the surrounding file. The extension has **no i18n** — inline Czech strings.
- No `.only`/`.skip`/`xit`/`xdescribe`; no `console.log` in `apps/` or `packages/`.
- Weekday convention everywhere in this feature: **ISO 1=Mon … 7=Sun** (`date-fns` `getISODay`). SPLY: `weekStartsOn=3`, `workingDays=[3,4,5]`. SVĚT PLODŮ: `weekStartsOn=1`, `workingDays=[1,2]`.
- All time math goes through `@tt/shared/time` (`now()`, `toAppZone`, `fromAppZone`) so tests can pin the clock via `setNowProvider`.
- Quality gate after each task: `pnpm lint && pnpm typecheck && pnpm --filter @tt/web test <touched test>` (schema tasks also `pnpm prisma:generate`).

---

## File structure

- `packages/db/prisma/schema.prisma` — add 4 fund columns to `Client` (Task 2).
- `packages/db/prisma/migrations/<ts>_client_work_fund/migration.sql` — migration (Task 2).
- `packages/shared/src/time/index.ts` — add `weekRangeFor()` + `daysInMonthCount` helper (Task 3).
- `packages/shared/src/time/time.test.ts` — tests for the helper (Task 3).
- `apps/web/src/lib/services/dashboard.ts` — relabel fallbacks (Task 1); add `clientFundProgress` + exported types (Task 4).
- `apps/web/tests/services/dashboard-reports.test.ts` — relabel test (Task 1); fund-progress tests (Task 4).
- `apps/web/src/lib/services/catalog.ts` — `updateClientFund` mutation (Task 5).
- `apps/web/src/lib/actions/catalog.ts` — `updateClientFundAction` (Task 5).
- `apps/web/tests/services/catalog.test.ts` (or the existing catalog test file) — mutation tests (Task 5).
- `apps/web/src/app/api/v1/dashboard/funds/route.ts` — new endpoint (Task 6).
- `apps/web/tests/api/dashboard-funds.test.ts` — endpoint tests (Task 6).
- `apps/web/src/app/(authenticated)/clients/ClientFundForm.tsx` — config UI (Task 7).
- `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx` — mount the form (Task 7).
- `apps/web/src/app/(authenticated)/dashboard/ClientFundsCard.tsx` — polling client component (Task 8).
- `apps/web/src/app/(authenticated)/dashboard/page.tsx` — render the card with initial data (Task 8).
- `apps/extension/src/api.ts` — `FundProgress` type + `getFundProgress()` (Task 9).
- `apps/extension/src/storage.ts` / `popup.tsx` — `tt:fund-display` setting + header bar (Task 9).

---

## Task 1: AIAGE-53 — relabel unassigned client/project fallback

**Files:**
- Modify: `apps/web/src/lib/services/dashboard.ts:122,159,221`
- Test: `apps/web/tests/services/dashboard-reports.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change — `clientShare`/`topProjects`/`dailyBreakdown` now return `'Nepřiřazený klient'` / `'Nepřiřazený projekt'` for null client/project.

- [ ] **Step 1: Write the failing test** — append to `dashboard-reports.test.ts` inside the top-level `describe`:

```ts
it('US-91: null client/project render Czech unassigned labels, not English', async () => {
  await withTx(async (tx) => {
    const w = await buildWorld(tx, 'unassigned');
    // an entry with no client and no project, inside the range
    await tx.timeEntry.create({
      data: {
        userId: w.user,
        companyId: w.company,
        clientId: null,
        projectId: null,
        description: 'loose',
        startedAt: new Date('2026-05-01T09:00:00Z'),
        endedAt: new Date('2026-05-01T10:00:00Z'),
      },
    });
    const share = await clientShare(tx, w.admin, w.company, w.range);
    const top = await topProjects(tx, w.admin, w.company, w.range);
    if (!share.ok || !top.ok) throw new Error('unexpected');
    expect(share.value.some((r) => r.clientName === 'Nepřiřazený klient')).toBe(true);
    expect(share.value.some((r) => r.clientName === '(deleted client)')).toBe(false);
    expect(top.value.some((r) => r.projectName === 'Nepřiřazený projekt')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tt/web test dashboard-reports -t "US-91"`
Expected: FAIL — value still contains `'(deleted client)'` / `'(deleted project)'`.

- [ ] **Step 3: Apply the relabel** in `dashboard.ts`:
  - Line 122: `name: e.client?.name ?? '(deleted client)',` → `name: e.client?.name ?? 'Nepřiřazený klient',`
  - Line 159: `name: e.project?.name ?? '(deleted project)'` → `name: e.project?.name ?? 'Nepřiřazený projekt'`
  - Line 221: `(e.client?.name ?? '(deleted client)')` → `(e.client?.name ?? 'Nepřiřazený klient')`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tt/web test dashboard-reports -t "US-91"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/dashboard.ts apps/web/tests/services/dashboard-reports.test.ts
git commit -m "fix(dashboard): Czech unassigned client/project labels (AIAGE-53)"
```

---

## Task 2: Schema — `Client` work-fund columns + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma:134-150` (Client model)
- Create: `packages/db/prisma/migrations/<timestamp>_client_work_fund/migration.sql`

**Interfaces:**
- Produces: `Client.fundInDashboard: boolean`, `Client.weeklyFundMinutes: number | null`, `Client.weekStartsOn: number | null`, `Client.workingDays: number[]`.

- [ ] **Step 1: Edit the `Client` model** — add these four fields after `sortOrder` (line 139):

```prisma
  fundInDashboard   Boolean  @default(false) @map("fund_in_dashboard")
  weeklyFundMinutes Int?     @map("weekly_fund_minutes")
  weekStartsOn      Int?     @map("week_starts_on")
  workingDays       Int[]    @default([]) @map("working_days")
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:up && pnpm --filter @tt/db exec prisma migrate dev --name client_work_fund --create-only`
Expected: a new folder `packages/db/prisma/migrations/<ts>_client_work_fund/migration.sql` containing `ALTER TABLE "clients" ADD COLUMN ...` for the four columns. Inspect it; confirm defaults `false` and `'{}'` (empty array) are present so existing rows are valid.

- [ ] **Step 3: Apply + regenerate client**

Run: `pnpm --filter @tt/db exec prisma migrate dev --name client_work_fund && pnpm prisma:generate`
Expected: migration applies cleanly; `@prisma/client` types now include the four fields (verify: `pnpm typecheck` passes).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add client work-fund config columns (AIAGE-52)"
```

---

## Task 3: `weekRangeFor` time helper

**Files:**
- Modify: `packages/shared/src/time/index.ts`
- Test: `packages/shared/src/time/time.test.ts`

**Interfaces:**
- Produces:
  - `weekRangeFor(weekStartsOn: number, reference?: Date): PeriodRange` — half-open `[start, end)`, 7-day window whose start is the most recent `weekStartsOn` (ISO 1–7) at 00:00 Europe/Prague ≤ `reference`.
  - `isoWorkingDayCountInMonth(workingDays: number[], reference?: Date): number` — number of calendar days in `reference`'s month whose ISO weekday ∈ `workingDays`.
  - `daysInMonthCount(reference?: Date): number` — calendar days in `reference`'s Prague month.

- [ ] **Step 1: Write the failing tests** — append to `time.test.ts`:

```ts
import { weekRangeFor, isoWorkingDayCountInMonth, daysInMonthCount } from './index';

describe('weekRangeFor', () => {
  it('US-90: week starting Wednesday contains the reference and spans 7 days', () => {
    // 2026-05-08 is a Friday (ISO 5). Week starts Wed 2026-05-06.
    const ref = new Date('2026-05-08T12:00:00Z');
    const r = weekRangeFor(3, ref);
    // start = 2026-05-06 00:00 Prague == 2026-05-05T22:00:00Z (CEST, +02:00)
    expect(r.start.toISOString()).toBe('2026-05-05T22:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-05-12T22:00:00.000Z');
    expect(ref >= r.start && ref < r.end).toBe(true);
  });

  it('US-90: when reference weekday == weekStartsOn, window starts that same day', () => {
    // 2026-05-06 is a Wednesday (ISO 3).
    const ref = new Date('2026-05-06T09:00:00Z');
    const r = weekRangeFor(3, ref);
    expect(r.start.toISOString()).toBe('2026-05-05T22:00:00.000Z');
  });

  it('US-90: counts working-day occurrences in a month', () => {
    // May 2026: Wednesdays = 6,13,20,27 (4); Thursdays 7,14,21,28 (4); Fridays 1,8,15,22,29 (5) => 13
    const ref = new Date('2026-05-15T12:00:00Z');
    expect(isoWorkingDayCountInMonth([3, 4, 5], ref)).toBe(13);
    // Mondays 4,11,18,25 (4) + Tuesdays 5,12,19,26 (4) = 8
    expect(isoWorkingDayCountInMonth([1, 2], ref)).toBe(8);
    expect(daysInMonthCount(ref)).toBe(31);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tt/shared test -t "US-90"`
Expected: FAIL — `weekRangeFor is not a function`.

- [ ] **Step 3: Implement** — add to `packages/shared/src/time/index.ts`. Extend the `date-fns` import with `getISODay`, `subDays`, `addDays`, `getDaysInMonth`, `eachDayOfInterval`:

```ts
// add to the existing date-fns import list:
//   getISODay, subDays, addDays, getDaysInMonth, eachDayOfInterval

/**
 * 7-day window (half-open) whose start is the most recent occurrence of the
 * ISO weekday `weekStartsOn` (1=Mon..7=Sun) at 00:00 Europe/Prague at or before
 * `reference`. E.g. weekStartsOn=3 (Wed) is SPLY's week boundary.
 */
export function weekRangeFor(weekStartsOn: number, reference: Date = now()): PeriodRange {
  const local = toAppZone(reference);
  const midnight = startOfDay(local);
  const currentIso = getISODay(midnight); // 1..7
  let diff = currentIso - weekStartsOn;
  if (diff < 0) diff += 7;
  const localStart = subDays(midnight, diff);
  return { start: fromAppZone(localStart), end: fromAppZone(addDays(localStart, 7)) };
}

/** Count days in `reference`'s Prague month whose ISO weekday is in `workingDays`. */
export function isoWorkingDayCountInMonth(
  workingDays: number[],
  reference: Date = now(),
): number {
  if (workingDays.length === 0) return 0;
  const local = toAppZone(reference);
  const set = new Set(workingDays);
  return eachDayOfInterval({ start: startOfMonth(local), end: endOfMonth(local) }).filter((d) =>
    set.has(getISODay(d)),
  ).length;
}

/** Calendar days in `reference`'s Prague month. */
export function daysInMonthCount(reference: Date = now()): number {
  return getDaysInMonth(toAppZone(reference));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tt/shared test -t "US-90"`
Expected: PASS. (If a DST-boundary assertion is off, the fix is always to build the instant with `fromAppZone(localStart)`, never `new Date(localStart)`.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/time/index.ts packages/shared/src/time/time.test.ts
git commit -m "feat(shared): weekRangeFor + working-day month helpers (AIAGE-52)"
```

---

## Task 4: `clientFundProgress` aggregation service

**Files:**
- Modify: `apps/web/src/lib/services/dashboard.ts`
- Test: `apps/web/tests/services/dashboard-reports.test.ts`

**Interfaces:**
- Consumes: `weekRangeFor`, `isoWorkingDayCountInMonth`, `daysInMonthCount`, `getPeriodRange` from `@tt/shared/time`.
- Produces (export from `dashboard.ts`):

```ts
export interface FundBar { targetMinutes: number; workedMinutes: number }
export interface FundDay {
  isoWeekday: number;      // 1..7
  date: string;            // 'YYYY-MM-DD' Prague
  targetMinutes: number;   // dailyTarget
  allocatedMinutes: number;// greedy fill
  isPast: boolean;         // day is strictly before today (Prague)
}
export interface ClientFund {
  clientId: string;
  clientName: string;
  weekly: FundBar;
  monthly: FundBar;
  days: FundDay[];         // [] for hours-only clients
}
export interface FundProgress {
  clients: ClientFund[];
  combined: { weekly: FundBar; monthly: FundBar };
}
export function clientFundProgress(
  db: Db, actorUserId: string, companyId: string, reference?: Date,
): Promise<DashResult<FundProgress>>;
```

- [ ] **Step 1: Write the failing tests** — append to `dashboard-reports.test.ts`. Uses `setNowProvider` (import from `@tt/shared/time`) to pin the clock, and configures a client's fund fields directly via `tx.client.update`:

```ts
it('US-90: weekly/monthly/day breakdown for a working-days client (team-wide)', async () => {
  const { setNowProvider } = await import('@tt/shared/time');
  setNowProvider(() => new Date('2026-05-08T12:00:00Z')); // Friday
  try {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'fund');
      // Make clientA a SPLY-like fund client: 24h/week, Wed/Thu/Fri.
      await tx.client.update({
        where: { id: w.clientA },
        data: { fundInDashboard: true, weeklyFundMinutes: 1440, weekStartsOn: 3, workingDays: [3, 4, 5] },
      });
      // Team logs 10h total this week on clientA: 8h Wed (admin) + 2h Thu (worker).
      await tx.timeEntry.create({ data: {
        userId: w.admin, companyId: w.company, clientId: w.clientA,
        startedAt: new Date('2026-05-06T06:00:00Z'), endedAt: new Date('2026-05-06T14:00:00Z') } });
      await tx.timeEntry.create({ data: {
        userId: w.user, companyId: w.company, clientId: w.clientA,
        startedAt: new Date('2026-05-07T06:00:00Z'), endedAt: new Date('2026-05-07T08:00:00Z') } });

      const r = await clientFundProgress(tx, w.admin, w.company);
      if (!r.ok) throw new Error('not ok');
      const sply = r.value.clients.find((c) => c.clientId === w.clientA);
      if (!sply) throw new Error('missing');
      expect(sply.weekly).toEqual({ targetMinutes: 1440, workedMinutes: 600 });
      // May 2026 has 13 Wed/Thu/Fri -> monthly target 13 * 480 = 6240
      expect(sply.monthly.targetMinutes).toBe(6240);
      expect(sply.monthly.workedMinutes).toBe(600);
      // Greedy: Wed filled 480, Thu gets remaining 120, Fri 0.
      const [wed, thu, fri] = sply.days;
      expect(wed).toMatchObject({ isoWeekday: 3, allocatedMinutes: 480, isPast: true });
      expect(thu).toMatchObject({ isoWeekday: 4, allocatedMinutes: 120, isPast: true });
      expect(fri).toMatchObject({ isoWeekday: 5, allocatedMinutes: 0, isPast: false }); // today
    });
  } finally {
    setNowProvider(null);
  }
});

it('US-90: hours-only client has proportional monthly target and no day breakdown', async () => {
  const { setNowProvider } = await import('@tt/shared/time');
  setNowProvider(() => new Date('2026-05-15T12:00:00Z'));
  try {
    await withTx(async (tx) => {
      const w = await buildWorld(tx, 'fund-ho');
      await tx.client.update({
        where: { id: w.clientA },
        data: { fundInDashboard: true, weeklyFundMinutes: 600, weekStartsOn: 1, workingDays: [] },
      });
      const r = await clientFundProgress(tx, w.admin, w.company);
      if (!r.ok) throw new Error('not ok');
      const c = r.value.clients.find((x) => x.clientId === w.clientA);
      if (!c) throw new Error('missing');
      expect(c.days).toEqual([]);
      // 600 * 31 / 7 = 2657.14 -> round 2657
      expect(c.monthly.targetMinutes).toBe(2657);
    });
  } finally {
    setNowProvider(null);
  }
});

it('US-90: combined bar sums fund clients; cross-company actor gets not_found', async () => {
  await withTx(async (tx) => {
    const w = await buildWorld(tx, 'fund-comb');
    await tx.client.update({ where: { id: w.clientA }, data: {
      fundInDashboard: true, weeklyFundMinutes: 1440, weekStartsOn: 3, workingDays: [3, 4, 5] } });
    await tx.client.update({ where: { id: w.clientB }, data: {
      fundInDashboard: true, weeklyFundMinutes: 960, weekStartsOn: 1, workingDays: [1, 2] } });
    const ok = await clientFundProgress(tx, w.admin, w.company);
    if (!ok.ok) throw new Error('not ok');
    expect(ok.value.combined.weekly.targetMinutes).toBe(2400); // 1440 + 960
    // outsider is admin of a different company -> existence hidden
    const cross = await clientFundProgress(tx, w.outsider, w.company);
    expect(cross.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tt/web test dashboard-reports -t "US-90"`
Expected: FAIL — `clientFundProgress is not a function`.

- [ ] **Step 3: Implement** — add to `dashboard.ts`. Import the helpers at the top (`import { weekRangeFor, isoWorkingDayCountInMonth, daysInMonthCount, getPeriodRange, toAppZone, now } from '@tt/shared/time';`) and the interfaces + function above the existing exports:

```ts
// (interfaces FundBar/FundDay/ClientFund/FundProgress from the Interfaces block)

const MIN = 60_000;
function isoDay(d: Date): number { const wd = toAppZone(d).getDay(); return wd === 0 ? 7 : wd; }
function dateKeyPrague(d: Date): string { return dayKey(d); } // dayKey already formats YYYY-MM-DD in Prague

export async function clientFundProgress(
  db: Db,
  actorUserId: string,
  companyId: string,
  reference: Date = now(),
): Promise<DashResult<FundProgress>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };

  const clients = await db.client.findMany({
    where: { companyId, fundInDashboard: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const month = getPeriodRange('month', reference); // inclusive end, fine for gte/lt below with +1ms guard
  const monthEndExclusive = new Date(month.end.getTime() + 1);
  const todayKey = dateKeyPrague(reference);

  const out: ClientFund[] = [];
  for (const c of clients) {
    const weeklyTarget = c.weeklyFundMinutes ?? 0;
    const wd = c.workingDays ?? [];
    const weekStartsOn = c.weekStartsOn ?? 1;
    const week = weekRangeFor(weekStartsOn, reference);

    const weekEntries = await db.timeEntry.findMany({
      where: { companyId, clientId: c.id, deletedAt: null, startedAt: { gte: week.start, lt: week.end } },
      select: { startedAt: true, endedAt: true },
    });
    const monthEntries = await db.timeEntry.findMany({
      where: { companyId, clientId: c.id, deletedAt: null, startedAt: { gte: month.start, lt: monthEndExclusive } },
      select: { startedAt: true, endedAt: true },
    });
    const weekWorked = Math.round(weekEntries.reduce((a, e) => a + durationMs(e), 0) / MIN);
    const monthWorked = Math.round(monthEntries.reduce((a, e) => a + durationMs(e), 0) / MIN);

    // monthly target
    let monthlyTarget: number;
    if (wd.length > 0) {
      const dailyTarget = Math.round(weeklyTarget / wd.length);
      monthlyTarget = isoWorkingDayCountInMonth(wd, reference) * dailyTarget;
    } else {
      monthlyTarget = Math.round((weeklyTarget * daysInMonthCount(reference)) / 7);
    }

    // per-day greedy allocation (working-days clients only)
    const days: FundDay[] = [];
    if (wd.length > 0) {
      const dailyTarget = Math.round(weeklyTarget / wd.length);
      let remaining = weekWorked;
      const ordered = [...wd].sort((a, b) => {
        const da = (a - weekStartsOn + 7) % 7;
        const dbb = (b - weekStartsOn + 7) % 7;
        return da - dbb;
      });
      for (const iso of ordered) {
        const offset = (iso - weekStartsOn + 7) % 7;
        const dayDate = new Date(week.start.getTime() + offset * 24 * 60 * MIN);
        const allocated = Math.min(remaining, dailyTarget);
        remaining -= allocated;
        const key = dateKeyPrague(dayDate);
        days.push({
          isoWeekday: iso,
          date: key,
          targetMinutes: dailyTarget,
          allocatedMinutes: allocated,
          isPast: key < todayKey,
        });
      }
    }

    out.push({
      clientId: c.id,
      clientName: c.name,
      weekly: { targetMinutes: weeklyTarget, workedMinutes: weekWorked },
      monthly: { targetMinutes: monthlyTarget, workedMinutes: monthWorked },
      days,
    });
  }

  const combined = {
    weekly: {
      targetMinutes: out.reduce((a, c) => a + c.weekly.targetMinutes, 0),
      workedMinutes: out.reduce((a, c) => a + c.weekly.workedMinutes, 0),
    },
    monthly: {
      targetMinutes: out.reduce((a, c) => a + c.monthly.targetMinutes, 0),
      workedMinutes: out.reduce((a, c) => a + c.monthly.workedMinutes, 0),
    },
  };
  return { ok: true, value: { clients: out, combined } };
}
```

Note: `durationMs` (already in the file) uses `new Date()`; that's fine because the tests pin `now()` only for windowing, and a running entry's live tick is acceptable. If a test needs a running-entry duration assertion, extend `durationMs` to accept `now()` — not required here.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tt/web test dashboard-reports -t "US-90"`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/dashboard.ts apps/web/tests/services/dashboard-reports.test.ts
git commit -m "feat(dashboard): clientFundProgress team-wide aggregation service (AIAGE-52)"
```

---

## Task 5: `updateClientFund` mutation + action

**Files:**
- Modify: `apps/web/src/lib/services/catalog.ts`
- Modify: `apps/web/src/lib/actions/catalog.ts`
- Test: `apps/web/tests/services/catalog.test.ts` (create if absent; otherwise append to the existing catalog test)

**Interfaces:**
- Produces:
  - `updateClientFund(db, actorUserId, clientId, patch): Promise<Result<true, 'not_found' | 'invalid'>>` where `patch = { fundInDashboard: boolean; weeklyFundMinutes: number | null; weekStartsOn: number | null; workingDays: number[] }`.
  - `updateClientFundAction(clientId, patch): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing test** — new file `apps/web/tests/services/catalog.test.ts` (mirror the `beforeAll/afterAll/withTx` harness from `dashboard-reports.test.ts`; import `getTestPrisma, stopTestPrisma, withTx` from `@tt/db/test`, `createCompany` from services/companies, `createClient` + `updateClientFund` from services/catalog):

```ts
it('US-90: updateClientFund persists config, validates, writes exactly one audit row', async () => {
  await withTx(async (tx) => {
    const admin = await tx.user.create({ data: { email: 'cf-a@x.test', fullName: 'A' } });
    const outsider = await tx.user.create({ data: { email: 'cf-o@x.test', fullName: 'O' } });
    const company = await createCompany(tx, { name: 'CF', createdByUserId: admin.id });
    await createCompany(tx, { name: 'CF2', createdByUserId: outsider.id });
    const c = await createClient(tx, admin.id, { companyId: company.id, name: 'SPLY' });
    if (!c.ok) throw new Error('setup');

    const before = await tx.auditLog.count({ where: { companyId: company.id } });
    const ok = await updateClientFund(tx, admin.id, c.value.id, {
      fundInDashboard: true, weeklyFundMinutes: 1440, weekStartsOn: 3, workingDays: [3, 4, 5],
    });
    expect(ok.ok).toBe(true);
    const row = await tx.client.findUnique({ where: { id: c.value.id } });
    expect(row?.fundInDashboard).toBe(true);
    expect(row?.workingDays).toEqual([3, 4, 5]);
    const after = await tx.auditLog.count({ where: { companyId: company.id } });
    expect(after - before).toBe(1); // exactly one audit row

    // invalid weekday
    const bad = await updateClientFund(tx, admin.id, c.value.id, {
      fundInDashboard: true, weeklyFundMinutes: 60, weekStartsOn: 9, workingDays: [3],
    });
    expect(bad).toEqual({ ok: false, reason: 'invalid' });

    // cross-company actor -> not_found (existence hidden)
    const cross = await updateClientFund(tx, outsider.id, c.value.id, {
      fundInDashboard: false, weeklyFundMinutes: null, weekStartsOn: null, workingDays: [],
    });
    expect(cross).toEqual({ ok: false, reason: 'not_found' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tt/web test catalog -t "US-90"`
Expected: FAIL — `updateClientFund is not a function`.

- [ ] **Step 3: Implement the service** — add to `apps/web/src/lib/services/catalog.ts` (uses the existing `requireAdmin` + `writeAudit` already imported in the file):

```ts
export interface ClientFundPatch {
  fundInDashboard: boolean;
  weeklyFundMinutes: number | null;
  weekStartsOn: number | null;
  workingDays: number[];
}

export async function updateClientFund(
  db: Db,
  actorUserId: string,
  clientId: string,
  patch: ClientFundPatch,
): Promise<Result<true, 'not_found' | 'invalid'>> {
  // validate: ISO weekdays 1..7, positive minutes when enabled
  const isoOk = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 7);
  const daysOk = patch.workingDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const minutesOk =
    patch.weeklyFundMinutes === null ||
    (Number.isInteger(patch.weeklyFundMinutes) && patch.weeklyFundMinutes > 0);
  if (!isoOk(patch.weekStartsOn) || !daysOk || !minutesOk) return { ok: false, reason: 'invalid' };
  if (patch.fundInDashboard && (patch.weeklyFundMinutes === null || patch.weekStartsOn === null)) {
    return { ok: false, reason: 'invalid' };
  }

  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return { ok: false, reason: 'not_found' };

  const dedupSortedDays = [...new Set(patch.workingDays)].sort((a, b) => a - b);
  await db.client.update({
    where: { id: clientId },
    data: {
      fundInDashboard: patch.fundInDashboard,
      weeklyFundMinutes: patch.weeklyFundMinutes,
      weekStartsOn: patch.weekStartsOn,
      workingDays: dedupSortedDays,
    },
  });
  await writeAudit(db, {
    companyId: c.companyId,
    actorUserId,
    action: 'update',
    entityType: 'client_fund',
    entityId: clientId,
    before: {
      fundInDashboard: c.fundInDashboard,
      weeklyFundMinutes: c.weeklyFundMinutes,
      weekStartsOn: c.weekStartsOn,
      workingDays: c.workingDays,
    },
    after: { ...patch, workingDays: dedupSortedDays },
  });
  return { ok: true, value: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tt/web test catalog -t "US-90"`
Expected: PASS.

- [ ] **Step 5: Add the server action** — append to `apps/web/src/lib/actions/catalog.ts` (import `updateClientFund` + `ClientFundPatch` in the existing import block):

```ts
export async function updateClientFundAction(
  clientId: string,
  patch: ClientFundPatch,
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await updateClientFund(prisma(), s.userId, clientId, patch);
  if (!r.ok) return { ok: false, error: r.reason === 'invalid' ? 'Neplatné hodnoty fondu' : 'Nelze uložit' };
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return { ok: true };
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/catalog.ts apps/web/src/lib/actions/catalog.ts apps/web/tests/services/catalog.test.ts
git commit -m "feat(catalog): updateClientFund mutation + action with audit (AIAGE-52)"
```

---

## Task 6: `GET /api/v1/dashboard/funds` endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/dashboard/funds/route.ts`
- Test: `apps/web/tests/api/dashboard-funds.test.ts`

**Interfaces:**
- Consumes: `resolveApiSession`, `pickActiveCompany` (`@/lib/api/auth`), `corsPreflight/errorCors/jsonCors` (`@/lib/api/cors`), `clientFundProgress` (`@/lib/services/dashboard`), `prisma` (`@/lib/session`).
- Produces: `GET` returns `FundProgress` JSON for admins; `404 not_found` for non-admin or cross-company; `401` when unauthenticated. `OPTIONS` preflight.

- [ ] **Step 1: Write the failing test** — `apps/web/tests/api/dashboard-funds.test.ts`. Mirror an existing API test's session helper (look at `apps/web/tests/api/*.test.ts` for how they mint a session/token and call the route `GET`); assert:

```ts
it('US-90: admin gets fund progress; non-admin and cross-company get 404', async () => {
  // ... build company with an admin + a plain user + a configured fund client (as in Task 4) ...
  // adminRes = await GET(reqWithToken(adminToken));  expect 200; body.clients length >= 1
  // userRes  = await GET(reqWithToken(userToken));   expect 404
  // otherRes = await GET(reqWithToken(otherCompanyAdminToken, company)); expect 404
});
```

Fill in the concrete session/token plumbing by copying the closest existing `apps/web/tests/api/*.test.ts` (e.g. the catalog or timer API test). Keep one `it` = one US.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @tt/web test dashboard-funds`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route** — `apps/web/src/app/api/v1/dashboard/funds/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { clientFundProgress } from '@/lib/services/dashboard';
import { prisma } from '@/lib/session';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return errorCors(req, 404, 'not_found');

  const r = await clientFundProgress(prisma(), session.userId, active.companyId);
  if (!r.ok) return errorCors(req, 404, 'not_found');
  return jsonCors(req, r.value);
}
```

(Confirm the `session.userId` field name against `resolveApiSession`'s return type; if it exposes the id differently, use that. `pickActiveCompany` returns `{ companyId }` as in `catalog/route.ts`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @tt/web test dashboard-funds`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/dashboard/funds/route.ts apps/web/tests/api/dashboard-funds.test.ts
git commit -m "feat(api): GET /api/v1/dashboard/funds admin-gated endpoint (AIAGE-52)"
```

---

## Task 7: Fund config UI on the Clients screen

**Files:**
- Create: `apps/web/src/app/(authenticated)/clients/ClientFundForm.tsx`
- Modify: `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx` (mount the form per client; feed the new fields through the props the manager already receives)

**Interfaces:**
- Consumes: `updateClientFundAction` from `@/lib/actions/catalog`.
- Produces: a per-client form (weekly hours, week-start weekday `<select>` 1–7, working-days checkboxes Mon–Sun, "Zobrazit v dashboardu" toggle) that calls `updateClientFundAction(clientId, patch)`.

- [ ] **Step 1: Ensure the client rows carry the fund fields.** In the server component that loads clients for `ClientsManager` (the `clients/page.tsx` or loader), include `fundInDashboard, weeklyFundMinutes, weekStartsOn, workingDays` in the select/shape passed down. Extend the `Client` prop type in `ClientsManager.tsx` accordingly.

- [ ] **Step 2: Create `ClientFundForm.tsx`** (`'use client'`):

```tsx
'use client';
import { useState, useTransition } from 'react';
import { updateClientFundAction } from '@/lib/actions/catalog';

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Po' }, { iso: 2, label: 'Út' }, { iso: 3, label: 'St' },
  { iso: 4, label: 'Čt' }, { iso: 5, label: 'Pá' }, { iso: 6, label: 'So' }, { iso: 7, label: 'Ne' },
];

export function ClientFundForm(props: {
  clientId: string;
  fundInDashboard: boolean;
  weeklyFundMinutes: number | null;
  weekStartsOn: number | null;
  workingDays: number[];
}): React.ReactElement {
  const [enabled, setEnabled] = useState(props.fundInDashboard);
  const [hours, setHours] = useState(props.weeklyFundMinutes ? props.weeklyFundMinutes / 60 : 0);
  const [weekStart, setWeekStart] = useState(props.weekStartsOn ?? 1);
  const [days, setDays] = useState<number[]>(props.workingDays);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (iso: number) =>
    setDays((d) => (d.includes(iso) ? d.filter((x) => x !== iso) : [...d, iso].sort((a, b) => a - b)));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await updateClientFundAction(props.clientId, {
        fundInDashboard: enabled,
        weeklyFundMinutes: hours > 0 ? Math.round(hours * 60) : null,
        weekStartsOn: enabled ? weekStart : null,
        workingDays: days,
      });
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Zobrazit v dashboardu
      </label>
      <label className="flex items-center gap-2">
        Týdenní fond (h):
        <input type="number" min={0} step={0.5} value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="w-20 rounded border px-1 dark:bg-zinc-800" />
      </label>
      <label className="flex items-center gap-2">
        Začátek týdne:
        <select value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}
          className="rounded border px-1 dark:bg-zinc-800">
          {WEEKDAYS.map((d) => <option key={d.iso} value={d.iso}>{d.label}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2">
        Pracovní dny:
        {WEEKDAYS.map((d) => (
          <label key={d.iso} className="flex items-center gap-0.5">
            <input type="checkbox" checked={days.includes(d.iso)} onChange={() => toggleDay(d.iso)} />
            {d.label}
          </label>
        ))}
      </div>
      {error ? <p className="text-red-600">{error}</p> : null}
      <button onClick={save} disabled={pending}
        className="rounded bg-zinc-900 px-2 py-1 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? 'Ukládám…' : 'Uložit fond'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount it** in `ClientsManager.tsx` under each client row (inside the client's expanded/detail area), passing the four fields from the client object:

```tsx
<ClientFundForm
  clientId={c.id}
  fundInDashboard={c.fundInDashboard}
  weeklyFundMinutes={c.weeklyFundMinutes}
  weekStartsOn={c.weekStartsOn}
  workingDays={c.workingDays}
/>
```

- [ ] **Step 4: Verify typecheck + lint + manual smoke**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint`
Then manually (dev server): open `/clients`, set SPLY = 24h, week start St, days St/Čt/Pá, toggle "Zobrazit v dashboardu", Save — reload confirms persistence. (E2E optional in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/clients/ClientFundForm.tsx apps/web/src/app/\(authenticated\)/clients/ClientsManager.tsx apps/web/src/app/\(authenticated\)/clients/page.tsx
git commit -m "feat(clients): per-client work-fund config form (AIAGE-52)"
```

---

## Task 8: Web dashboard fund card (server data + polling client)

**Files:**
- Create: `apps/web/src/app/(authenticated)/dashboard/ClientFundsCard.tsx` (`'use client'`)
- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx` (fetch initial `clientFundProgress`, render the card)

**Interfaces:**
- Consumes: `FundProgress` type from `@/lib/services/dashboard`; `GET /api/v1/dashboard/funds`.
- Produces: a `Card` titled "Pracovní fondy klientů" showing per-client weekly + monthly bars, per-day green/red strip (working-days clients), and the combined 40h/week bar; refreshes every 45s.

- [ ] **Step 1: Create `ClientFundsCard.tsx`**:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import type { FundProgress, ClientFund } from '@/lib/services/dashboard';

const fmtH = (min: number) => `${(min / 60).toFixed(1)} h`;
const pct = (worked: number, target: number) => (target > 0 ? Math.min(100, (worked / target) * 100) : 0);

function Bar({ worked, target }: { worked: number; target: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div className="h-full bg-blue-500 dark:bg-blue-400" style={{ width: `${pct(worked, target)}%` }} />
      </div>
      <span className="w-24 text-right text-xs tabular-nums text-zinc-500">
        {fmtH(worked)} / {fmtH(target)}
      </span>
    </div>
  );
}

function DayStrip({ client }: { client: ClientFund }): React.ReactElement | null {
  if (client.days.length === 0) return null;
  return (
    <div className="mt-1 flex gap-1">
      {client.days.map((d) => {
        const green = pct(d.allocatedMinutes, d.targetMinutes);
        const red = d.isPast ? 100 - green : 0;
        return (
          <div key={d.date} className="flex-1">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
              <div className="h-full bg-emerald-500" style={{ width: `${green}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${red}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClientFundsCard({ initial }: { initial: FundProgress }): React.ReactElement {
  const [data, setData] = useState<FundProgress>(initial);
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/v1/dashboard/funds', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j) setData(j as FundProgress); })
        .catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Pracovní fondy klientů</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {data.clients.map((c) => (
          <div key={c.clientId} className="space-y-1">
            <div className="text-sm font-medium">{c.clientName}</div>
            <div className="text-[10px] uppercase text-zinc-400">Týden</div>
            <Bar worked={c.weekly.workedMinutes} target={c.weekly.targetMinutes} />
            <DayStrip client={c} />
            <div className="text-[10px] uppercase text-zinc-400">Měsíc</div>
            <Bar worked={c.monthly.workedMinutes} target={c.monthly.targetMinutes} />
          </div>
        ))}
        <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="text-sm font-medium">Celkem (týden)</div>
          <Bar worked={data.combined.weekly.workedMinutes} target={data.combined.weekly.targetMinutes} />
        </div>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `dashboard/page.tsx`** — import `clientFundProgress` + `ClientFundsCard`, add it to the `Promise.all`, and render the card (guard the not-ok/empty case):

```tsx
// in imports:
import { clientFundProgress } from '@/lib/services/dashboard';
import { ClientFundsCard } from './ClientFundsCard';

// add to Promise.all:
const funds = await clientFundProgress(prisma(), s.userId, s.activeCompanyId);

// in JSX, near the client-share card:
{funds.ok && funds.value.clients.length > 0 ? <ClientFundsCard initial={funds.value} /> : null}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint`
Manual: with SPLY/SVĚT PLODŮ configured + some entries, `/dashboard` shows weekly/monthly bars, day strips, combined bar; leaving the tab open ~45s triggers a `/api/v1/dashboard/funds` refetch (Network tab).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/dashboard/ClientFundsCard.tsx apps/web/src/app/\(authenticated\)/dashboard/page.tsx
git commit -m "feat(dashboard): client work-fund progress card with polling (AIAGE-52)"
```

---

## Task 9: Extension header fund bar + display setting

**Files:**
- Modify: `apps/extension/src/api.ts` (add `FundProgress` type + `getFundProgress()`; anchor: existing `getTimer` at `api.ts:255`)
- Modify: `apps/extension/src/storage.ts` (add `tt:fund-display` get/set; mirror `getApiBase`/`setApiBase` at `api.ts:166` pattern)
- Modify: `apps/extension/src/popup.tsx` (render a compact bar below `Header` at `popup.tsx:441`, gated on the existing `isAdmin` memo at `popup.tsx:414`; add a display-mode control in `MoreMenu` at `popup.tsx:610`)

**Interfaces:**
- Consumes: the `/api/v1/dashboard/funds` endpoint from Task 6; the `FundProgress` shape (mirror the web type locally).
- Produces: a header bar whose content is driven by `tt:fund-display ∈ {'off','combined','per-client'}`.

- [ ] **Step 1: Add the API call** in `api.ts` (mirror `getTimer`):

```ts
export interface ExtFundBar { targetMinutes: number; workedMinutes: number }
export interface ExtFundDay { isoWeekday: number; date: string; targetMinutes: number; allocatedMinutes: number; isPast: boolean }
export interface ExtClientFund { clientId: string; clientName: string; weekly: ExtFundBar; monthly: ExtFundBar; days: ExtFundDay[] }
export interface ExtFundProgress { clients: ExtClientFund[]; combined: { weekly: ExtFundBar; monthly: ExtFundBar } }

export async function getFundProgress(session: ApiSession, companyId?: string): Promise<ExtFundProgress> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<ExtFundProgress>(session.apiBase, `/api/v1/dashboard/funds${qs}`, { method: 'GET' }, session.token);
}
```

- [ ] **Step 2: Add the display setting** — in `storage.ts` add a key `tt:fund-display` and helpers:

```ts
export type FundDisplay = 'off' | 'combined' | 'per-client';
export async function getFundDisplay(): Promise<FundDisplay> {
  const v = (await storage.get('tt:fund-display')) as FundDisplay | undefined;
  return v ?? 'off';
}
export async function setFundDisplay(v: FundDisplay): Promise<void> {
  await storage.set('tt:fund-display', v);
}
```

(Use whatever `StorageAdapter` accessor the file already exposes — match `getApiBase`/`setApiBase`.)

- [ ] **Step 3: Render the bar** in `popup.tsx`. Add state `fund: ExtFundProgress | null` and `fundDisplay: FundDisplay`; load `getFundDisplay()` on mount and, when `isAdmin && fundDisplay !== 'off'`, call `getFundProgress(session, companyId)` (reuse the existing refresh cycle). Below `<Header .../>` render:

```tsx
{isAdmin && fundDisplay !== 'off' && fund ? (
  <div className="px-3 py-1.5">
    {fundDisplay === 'combined' ? (
      <FundMiniBar bar={fund.combined.weekly} label="Týden" />
    ) : (
      fund.clients.map((c) => (
        <div key={c.clientId} className="mb-1">
          <div className="mb-0.5 flex justify-between text-[10px] text-zinc-500">
            <span className="truncate">{c.clientName}</span>
            <span>{(c.weekly.workedMinutes / 60).toFixed(1)}/{(c.weekly.targetMinutes / 60).toFixed(0)} h</span>
          </div>
          {c.days.length > 0 ? (
            <div className="flex gap-0.5">
              {c.days.map((d) => {
                const g = d.targetMinutes > 0 ? Math.min(100, (d.allocatedMinutes / d.targetMinutes) * 100) : 0;
                const r = d.isPast ? 100 - g : 0;
                return (
                  <div key={d.date} className="flex h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div className="h-full bg-emerald-500" style={{ width: `${g}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${r}%` }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <FundMiniBar bar={c.weekly} />
          )}
        </div>
      ))
    )}
  </div>
) : null}
```

Add a small `FundMiniBar` component next to `Header` (single blue track, same markup as the web `Bar`, condensed).

- [ ] **Step 4: Add the setting control** — in `MoreMenu` (`popup.tsx:610`), add a 3-way selector (Off / Souhrn / Po klientech) that calls `setFundDisplay(v)` and updates state. Only show it when `isAdmin`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @tt/extension typecheck && pnpm --filter @tt/extension lint && pnpm --filter @tt/extension build`
Manual: load the unpacked extension against a dev server, log in as admin, set display to "Po klientech" — the header shows a per-client week strip; "Off" hides it; a non-admin account never sees it.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/api.ts apps/extension/src/storage.ts apps/extension/src/popup.tsx
git commit -m "feat(extension): manager work-fund header bar + display setting (AIAGE-52)"
```

---

## Task 10 (optional): E2E + full gate

**Files:**
- Create: `apps/web/tests/e2e/client-funds.spec.ts` (Playwright) — optional but recommended.

- [ ] **Step 1:** Seed (or configure via UI) a fund client, log in as admin, assert `/dashboard` renders "Pracovní fondy klientů" with a bar for that client; assert a non-admin does not see the card.
- [ ] **Step 2: Full gate**

Run: `pnpm test:all` (lint + typecheck + unit/integration) and `pnpm test:trace` (US coverage must stay 100%). Add US-90/US-91 to the coverage/reference docs if the tracker requires an entry.

- [ ] **Step 3: Docs** — update `docs/architecture/` (dashboard + extension gain a fund feature), `docs/reference/` (new US-90/US-91, the four `Client` columns, the `/api/v1/dashboard/funds` endpoint). Append a `docs/gotchas.md` entry only if something bit you for 20+ min.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/client-funds.spec.ts docs
git commit -m "test(e2e)+docs: client work-fund feature (AIAGE-52, AIAGE-53)"
```

---

## Self-review notes (coverage map)

- **AIAGE-53 relabel** → Task 1.
- **Schema (4 cols)** → Task 2. **Week/month math** → Task 3. **Aggregation (team-wide, greedy day fill, combined, hours-only proportional monthly)** → Task 4. **Config mutation + audit + cross-company 404** → Task 5. **Endpoint + admin gate + 404** → Task 6. **Config UI** → Task 7. **Web dashboard + polling** → Task 8. **Extension bar + user setting** → Task 9. **E2E/docs/US-trace** → Task 10.
- Types are consistent across tasks: `FundBar/FundDay/ClientFund/FundProgress` defined in Task 4 and reused in Tasks 6/8; `ClientFundPatch` defined in Task 5 and reused in the action; extension mirrors the shape as `ExtFundProgress`.
- Open follow-ups (out of scope, noted for later): a real `manager` role + "external collaborator" self-only visibility; making running-entry live duration exact in `durationMs`. Both are explicitly future per the spec.
