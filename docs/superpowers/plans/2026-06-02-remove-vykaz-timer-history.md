# Timer History + Remove Výkaz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone Výkaz (`/timesheet`) tab with an extension-style, day/month-grouped recent-history view on the Stopky (`/timer`) page.

**Architecture:** Surface the `history` field `/api/v1/timer` already computes. Extract that window query into a `listRecentHistory` service shared by the route + the timer page SSR; port the extension's pure `groupRecentByDay` to the web (Prague-aware); render it in a new `TimerHistory` component that replaces `TodayList`. Then delete the whole Výkaz feature.

**Tech Stack:** Next.js 15 (App Router, route handlers, server components), React 19, TypeScript (strict), Prisma 6, Zod, next-intl, Vitest + testcontainers, Playwright.

---

## Conventions for every task

- **Web tests:** `pnpm --filter @tt/web test <pattern>` (vitest, node env, 60s timeout; globs `src/**/*.test.ts(x)` + `tests/**/*.test.ts`). DB-backed tests use `getTestPrisma`/`withTx` from `@tt/db/test` (real Postgres via testcontainers — never mock the DB).
- **DB SAFETY:** the dev `.env` points at a PRODUCTION database. Never run `pnpm dev`/`prisma migrate`/`prisma seed`/start a server. Only the test/lint/typecheck/build commands here (tests use ephemeral testcontainers).
- **One user story per `it`**, US ID in the name. This feature keeps **US-26** (relocated to the timer history).
- **i18n:** new user-facing strings go in `apps/web/messages/cs.json`. (The timer page has some pre-existing hardcoded Czech — out of scope to convert.)
- **Commit** at the end of each task; messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch is already `feat/timer-history-remove-vykaz`.

## File map

| File                                                        | Action | Responsibility                                                          |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/web/src/lib/recent.ts`                                | create | pure Prague-aware `groupRecentByDay` + labelers                         |
| `apps/web/src/lib/recent.test.ts`                           | create | grouping unit tests                                                     |
| `apps/web/src/lib/services/time-entries.ts`                 | modify | add `listRecentHistory`; later delete `listMyWeek`                      |
| `apps/web/tests/services/time-entries.test.ts`              | modify | add `listRecentHistory` test; later fix US-25 + drop US-26/`listMyWeek` |
| `apps/web/src/lib/timer-events.ts`                          | modify | schema: add `history`, drop `today`                                     |
| `apps/web/src/app/api/v1/timer/route.ts`                    | modify | use `listRecentHistory`; drop `today`                                   |
| `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx`   | create | grouped history UI (absorbs `TodayList`'s row)                          |
| `apps/web/src/app/(authenticated)/timer/TodayList.tsx`      | delete | replaced by `TimerHistory`                                              |
| `apps/web/src/app/(authenticated)/timer/TimerLists.tsx`     | modify | `today` → `history`; render `TimerHistory`                              |
| `apps/web/src/app/(authenticated)/timer/page.tsx`           | modify | SSR initial history via `listRecentHistory`                             |
| `apps/web/messages/cs.json`                                 | modify | `timer.history.*`; remove `nav.timesheet`                               |
| `apps/web/src/app/(authenticated)/timesheet/`               | delete | the Výkaz route                                                         |
| `apps/web/src/app/(authenticated)/nav.ts` + `nav.test.ts`   | modify | drop the Výkaz nav item                                                 |
| `apps/web/src/lib/actions/{time,auto-stack,catalog}.ts`     | modify | strip `revalidatePath('/timesheet')`                                    |
| `apps/web/src/app/(authenticated)/DESCRIPTION.md`           | modify | drop `/timesheet` row                                                   |
| `docs/reference/features.md`, `docs/architecture/README.md` | modify | reword US-26; drop Výkaz                                                |

---

## Task 1: Port the grouping logic (Prague-aware)

**Files:**

- Create: `apps/web/src/lib/recent.ts`
- Test: `apps/web/src/lib/recent.test.ts`

The extension's `apps/extension/src/recent.ts` buckets by **browser-local** time. The web SSRs on UTC containers, so the web port must bucket by **Europe/Prague** (reuse `dayKey` from `@/lib/time-format`, which is `toAppZone`-based, and `toAppZone` for the month/weekday parts).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/recent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupRecentByDay, type RecentEntryInput } from './recent.js';

const H = 60 * 60 * 1000;

function entry(over: Partial<RecentEntryInput>): RecentEntryInput {
  return {
    id: Math.random().toString(36).slice(2),
    description: 'work',
    startedAt: '2026-06-02T08:00:00Z',
    endedAt: '2026-06-02T10:00:00Z',
    clientName: 'Acme',
    projectName: 'Web',
    tags: [],
    ...over,
  };
}

describe('groupRecentByDay', () => {
  const NOW = new Date('2026-06-02T09:00:00Z'); // Prague: 2 Jun 2026, 11:00 (CEST)

  it('US-26: groups consecutive same-day entries with a per-day total', () => {
    const groups = groupRecentByDay(
      [
        entry({ startedAt: '2026-06-02T08:00:00Z', endedAt: '2026-06-02T10:00:00Z' }), // 2h
        entry({ startedAt: '2026-06-02T06:00:00Z', endedAt: '2026-06-02T07:00:00Z' }), // 1h, same Prague day
        entry({ startedAt: '2026-06-01T06:00:00Z', endedAt: '2026-06-01T07:30:00Z' }), // prev day
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe('2026-06-02');
    expect(groups[0]!.total).toBe(3 * H);
    expect(groups[0]!.label).toBe('Dnes');
    expect(groups[1]!.label).toBe('Včera');
  });

  it('US-26: labels months for dividers and buckets a cross-midnight entry by its Prague day', () => {
    // 2026-05-31 22:30 UTC = 2026-06-01 00:30 Prague (CEST) → belongs to June 1.
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-05-31T22:30:00Z', endedAt: '2026-05-31T23:00:00Z' })],
      NOW,
    );
    expect(groups[0]!.key).toBe('2026-06-01');
    expect(groups[0]!.monthKey).toBe('2026-06');
    expect(groups[0]!.monthLabel).toBe('Červen 2026');
  });

  it('US-26: tolerates empty / null input', () => {
    expect(groupRecentByDay([], NOW)).toEqual([]);
    expect(groupRecentByDay(null, NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @tt/web test recent`
Expected: FAIL — module `recent` not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/recent.ts`:

```ts
/**
 * Pure helpers behind the timer page's history section. Prague-aware (the web
 * SSRs on UTC servers, so bucketing must use Europe/Prague, not local time).
 * Ported from apps/extension/src/recent.ts (which buckets browser-local).
 */
import { toAppZone } from '@tt/shared/time';
import { dayKey } from '@/lib/time-format';

export interface RecentEntryInput {
  id: string;
  description: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  clientName: string | null;
  projectName: string | null;
  tags: { name: string; color: string }[];
}

export interface RecentDayGroup {
  key: string; // Prague YYYY-MM-DD — stable React key
  label: string; // "Dnes" | "Včera" | "Po 12.05."
  monthKey: string; // Prague YYYY-MM — for month dividers
  monthLabel: string; // "Květen 2026"
  total: number; // sum of durations (ms); running entries clamp to `now`
  items: RecentEntryInput[];
}

const WEEKDAY_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const MONTH_CS = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
];
const pad = (n: number): string => String(n).padStart(2, '0');

function monthKeyOf(d: Date): string {
  const z = toAppZone(d);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}`;
}
function monthLabelOf(d: Date): string {
  const z = toAppZone(d);
  return `${MONTH_CS[z.getMonth()] ?? ''} ${z.getFullYear()}`;
}
function dayLabelOf(d: Date, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(d);
  if (k === todayKey) return 'Dnes';
  if (k === yesterdayKey) return 'Včera';
  const z = toAppZone(d);
  return `${WEEKDAY_CS[z.getDay()] ?? ''} ${pad(z.getDate())}.${pad(z.getMonth() + 1)}.`;
}

/**
 * Groups entries by Prague-local day. Assumes entries arrive newest-first
 * (server contract), so same-day entries are contiguous → single O(n) pass.
 * Tolerates null/undefined so a partial response can't blank the page.
 */
export function groupRecentByDay(
  entries: RecentEntryInput[] | null | undefined,
  now: Date,
): RecentDayGroup[] {
  if (!entries || entries.length === 0) return [];
  const nowMs = now.getTime();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(nowMs - 86_400_000));
  const groups: RecentDayGroup[] = [];
  for (const e of entries) {
    const started = new Date(e.startedAt);
    const k = dayKey(started);
    const endMs = e.endedAt ? new Date(e.endedAt).getTime() : nowMs;
    const dur = endMs - started.getTime();
    const last = groups[groups.length - 1];
    if (last && last.key === k) {
      last.total += dur;
      last.items.push(e);
    } else {
      groups.push({
        key: k,
        label: dayLabelOf(started, todayKey, yesterdayKey),
        monthKey: monthKeyOf(started),
        monthLabel: monthLabelOf(started),
        total: dur,
        items: [e],
      });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @tt/web test recent`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/recent.ts apps/web/src/lib/recent.test.ts
git commit -m "feat(timer): port Prague-aware recent-history grouping" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `listRecentHistory` service

**Files:**

- Modify: `apps/web/src/lib/services/time-entries.ts`
- Test: `apps/web/tests/services/time-entries.test.ts`

Extract the route's history-window query into a reusable service (replaces `listMyWeek`, deleted in Task 4). Preserves the route's exact window: `[start-of-last-month, max(end-of-week, end-of-month))`, completed entries only, newest-first, with client/project names + tag colors.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/services/time-entries.test.ts` (it already imports `createManualEntry`, `startTimer`, `getTestPrisma`/`withTx`, and a `bootstrap` world helper). Add `listRecentHistory` to the import from `../../src/lib/services/time-entries.js`, then add:

```ts
it('US-26: listRecentHistory returns completed entries in the ~2-month window, newest-first, company-scoped', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us26hist');
    const now = new Date('2026-06-02T09:00:00Z');
    // In window (May), completed:
    await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-05-10T08:00:00Z'),
        endedAt: new Date('2026-05-10T10:00:00Z'),
      },
      now,
    );
    // In window (June), completed, newer:
    await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-06-01T08:00:00Z'),
        endedAt: new Date('2026-06-01T09:00:00Z'),
      },
      now,
    );
    // Out of window (March):
    await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-03-01T08:00:00Z'),
        endedAt: new Date('2026-03-01T09:00:00Z'),
      },
      now,
    );
    // Running (no endedAt) — must be excluded from history:
    await startTimer(tx, w.user, { companyId: w.company });

    const res = await listRecentHistory(tx, w.user, w.company, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((e) => e.startedAt.toISOString())).toEqual([
      '2026-06-01T08:00:00.000Z',
      '2026-05-10T08:00:00.000Z',
    ]);
    expect(res.value.every((e) => e.endedAt !== null)).toBe(true);

    // Cross-company isolation: an outsider (no membership) gets not_found.
    const cross = await listRecentHistory(tx, w.outsider, w.company, now);
    expect(cross.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @tt/web test time-entries`
Expected: FAIL — `listRecentHistory` is not exported.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/services/time-entries.ts`: add `getPeriodRange` to the imports (top of file):

```ts
import { getPeriodRange } from '@tt/shared/time';
```

Then add, in the `// --- Reads ---` section (next to `listMyWeek` / `listRecentEntries`):

```ts
export interface HistoryEntry {
  id: string;
  description: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  tags: { id: string; name: string; color: string }[];
}

/**
 * Completed entries for the timer-page history window: start-of-last-month to
 * max(end-of-this-week, end-of-this-month) — extended to the ISO week end so a
 * week spanning the month boundary isn't cut off. Newest-first, with client /
 * project names + tag colors for the rich rows. Backs both /api/v1/timer and
 * the /timer page SSR.
 */
export async function listRecentHistory(
  db: Db,
  actorUserId: string,
  companyId: string,
  now: Date,
): Promise<Result<HistoryEntry[]>> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };

  const weekRange = getPeriodRange('week', now);
  const monthRange = getPeriodRange('month', now);
  const lastMonthRef = new Date(now);
  lastMonthRef.setMonth(lastMonthRef.getMonth() - 1);
  const lastMonthRange = getPeriodRange('month', lastMonthRef);
  const historyEnd =
    weekRange.end.getTime() > monthRange.end.getTime() ? weekRange.end : monthRange.end;

  const rows = await db.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: lastMonthRange.start, lt: historyEnd },
    },
    include: { client: true, project: true, tags: { include: { tag: true } } },
    orderBy: { startedAt: 'desc' },
  });

  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      clientId: r.clientId,
      clientName: r.client?.name ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      tags: r.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    })),
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @tt/web test time-entries`
Expected: PASS (the new US-26 test + all existing tests stay green — `listMyWeek` is still present at this point).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/time-entries.ts apps/web/tests/services/time-entries.test.ts
git commit -m "feat(timer): add listRecentHistory service for the history window" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the history into the timer page

One cohesive change (the pieces must land together to compile). Verified by typecheck + lint (UI has no unit test; behavior is covered by Tasks 1–2 + the e2e in Task 6).

**Files:**

- Modify: `apps/web/src/lib/timer-events.ts`
- Modify: `apps/web/src/app/api/v1/timer/route.ts`
- Create: `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx`
- Delete: `apps/web/src/app/(authenticated)/timer/TodayList.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerLists.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/page.tsx`
- Modify: `apps/web/messages/cs.json`

- [ ] **Step 1: Schema — add `history`, drop `today`**

In `apps/web/src/lib/timer-events.ts`, replace `TimerStateResponseSchema`:

```ts
export const TimerStateResponseSchema = z.object({
  running: z.array(TimerEntrySchema).optional(),
  history: z.array(TimerEntrySchema).optional(),
});
```

(Leave `TimerEntrySchema`/`TimerEntry` unchanged.)

- [ ] **Step 2: Route — use `listRecentHistory`, drop `today`**

In `apps/web/src/app/api/v1/timer/route.ts`: change the service import to include `listRecentHistory`:

```ts
import { listRecentHistory, startTimer } from '@/lib/services/time-entries';
```

In the no-active-company branch, drop the `today: []` line (keep `running: []`, `history: []`). Replace the data-gathering block (the `now`/`dayStart`/`dayEnd` + the three-query `Promise.all` + the today/history `dto` mapping) with:

```ts
const now = new Date();
const weekRange = getPeriodRange('week', now);
const monthRange = getPeriodRange('month', now);
const lastMonthRef = new Date(now);
lastMonthRef.setMonth(lastMonthRef.getMonth() - 1);
const lastMonthRange = getPeriodRange('month', lastMonthRef);

const [running, historyResult] = await Promise.all([
  prisma().timeEntry.findMany({
    where: { userId: session.userId, companyId: active.companyId, endedAt: null, deletedAt: null },
    include: { client: true, project: true, tags: { include: { tag: true } } },
    orderBy: { startedAt: 'desc' },
  }),
  listRecentHistory(prisma(), session.userId, active.companyId, now),
]);
const history = historyResult.ok ? historyResult.value : [];

function sumIn(start: Date, end: Date): number {
  let total = 0;
  for (const e of history) {
    if (!e.endedAt) continue;
    const t = e.startedAt.getTime();
    if (t >= start.getTime() && t < end.getTime())
      total += e.endedAt.getTime() - e.startedAt.getTime();
  }
  return total;
}
const summary = {
  weekMs: sumIn(weekRange.start, weekRange.end),
  monthMs: sumIn(monthRange.start, monthRange.end),
  lastMonthMs: sumIn(lastMonthRange.start, lastMonthRange.end),
};

function dto(e: (typeof running)[number]): unknown {
  return {
    id: e.id,
    description: e.description,
    clientId: e.clientId,
    clientName: e.client?.name ?? null,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt?.toISOString() ?? null,
    tags: e.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
  };
}
function historyDto(e: (typeof history)[number]): unknown {
  return {
    id: e.id,
    description: e.description,
    clientId: e.clientId,
    clientName: e.clientName,
    projectId: e.projectId,
    projectName: e.projectName,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    tags: e.tags,
  };
}
return jsonCors(req, {
  companyId: active.companyId,
  running: running.map(dto),
  history: history.map(historyDto),
  summary,
});
```

(Delete the old `dayStart`/`dayEnd` vars and the `today` query/field entirely. Keep the existing `getPeriodRange` import; the doc-comment header's "today's completed entries (`today`)" line should be updated to mention only `history`.)

- [ ] **Step 3: Create `TimerHistory.tsx`** (absorbs `TodayList`'s `Row`)

Create `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx`:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button, Card, CardBody, EmptyState, useConfirm } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { deleteEntryAction, playAgainAction } from '@/lib/actions/time';
import { notifyTimerChanged } from '@/lib/timer-events';
import { EditEntryButton } from '@/components/time/EditEntryButton';
import { fmtTime, fmtDur } from '@/lib/time-format';
import { groupRecentByDay, type RecentEntryInput } from '@/lib/recent';

export interface HistoryEntryView extends RecentEntryInput {
  endedAt: string; // history entries are always completed
}

export function TimerHistory({
  entries,
  onDeleted,
  autoStackOverlaps = false,
}: {
  entries: HistoryEntryView[];
  onDeleted: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const t = useTranslations('timer.history');
  if (entries.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title={t('empty')} description={t('emptyHint')} />
        </CardBody>
      </Card>
    );
  }
  const groups = groupRecentByDay(entries, new Date());
  let lastMonthKey = '';
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const showMonth = g.monthKey !== lastMonthKey;
        lastMonthKey = g.monthKey;
        return (
          <div key={g.key} className="space-y-2">
            {showMonth ? (
              <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {g.monthLabel}
              </p>
            ) : null}
            <Card>
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-700/60 px-4 py-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {g.label}
                </span>
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {fmtDur(g.total)}
                </span>
              </div>
              <CardBody>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                  {g.items.map((e) => (
                    <Row
                      key={e.id}
                      entry={e as HistoryEntryView}
                      onDeleted={onDeleted}
                      autoStackOverlaps={autoStackOverlaps}
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  entry,
  onDeleted,
  autoStackOverlaps = false,
}: {
  entry: HistoryEntryView;
  onDeleted: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [deletePending, setDeletePending] = useState(false);
  const [playPending, setPlayPending] = useState(false);
  const confirm = useConfirm();
  const t = useTranslations('timer.confirm');
  async function runDelete(): Promise<void> {
    const ok = await confirm({
      title: t('deleteEntryTitle'),
      description: t('deleteEntryDescription'),
    });
    if (!ok) return;
    setDeletePending(true);
    try {
      const r = await deleteEntryAction(entry.id);
      if (r.ok) onDeleted(entry.id);
    } finally {
      setDeletePending(false);
    }
    notifyTimerChanged();
  }
  async function runPlayAgain(): Promise<void> {
    setPlayPending(true);
    try {
      await playAgainAction(entry.id);
    } finally {
      setPlayPending(false);
    }
    notifyTimerChanged();
  }
  const startedAt = new Date(entry.startedAt);
  const endedAt = new Date(entry.endedAt);
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {entry.description || (
            <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {entry.clientName ? <span>{entry.clientName}</span> : null}
          {entry.projectName ? <span>· {entry.projectName}</span> : null}
          {entry.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
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
    </li>
  );
}
```

- [ ] **Step 4: Delete `TodayList.tsx`**

```bash
git rm "apps/web/src/app/(authenticated)/timer/TodayList.tsx"
```

- [ ] **Step 5: Update `TimerLists.tsx`** (`today` → `history`)

Replace `apps/web/src/app/(authenticated)/timer/TimerLists.tsx` with:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { TIMER_CHANGED_EVENT, TimerStateResponseSchema, type TimerEntry } from '@/lib/timer-events';
import { RunningTimers } from './RunningTimers';
import { TimerHistory, type HistoryEntryView } from './TimerHistory';

interface RunningEntry {
  id: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  tags: { name: string; color: string }[];
}

function toRunning(e: TimerEntry): RunningEntry {
  return {
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    projectName: e.projectName,
    startedAt: e.startedAt,
    tags: e.tags.map((t) => ({ name: t.name, color: t.color })),
  };
}

function toHistory(e: TimerEntry): HistoryEntryView | null {
  if (!e.endedAt) return null;
  return {
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    projectName: e.projectName,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    tags: e.tags.map((t) => ({ name: t.name, color: t.color })),
  };
}

export function TimerLists({
  initialRunning,
  initialHistory,
  autoStackOverlaps = false,
}: {
  initialRunning: RunningEntry[];
  initialHistory: HistoryEntryView[];
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [running, setRunning] = useState<RunningEntry[]>(initialRunning);
  const [history, setHistory] = useState<HistoryEntryView[]>(initialHistory);
  const [now, setNow] = useState<number | null>(null);
  const hasRunning = running.length > 0;

  useEffect(() => {
    if (!hasRunning) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasRunning]);

  useEffect(() => {
    let cancelled = false;
    async function refetch(): Promise<void> {
      try {
        const res = await fetch('/api/v1/timer', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return;
        const parsed = TimerStateResponseSchema.safeParse(await res.json());
        if (!parsed.success || cancelled) return;
        setRunning((parsed.data.running ?? []).map(toRunning));
        setHistory(
          (parsed.data.history ?? [])
            .map(toHistory)
            .filter((e): e is HistoryEntryView => e !== null),
        );
      } catch {
        // ignore network/parse errors
      }
    }
    const onChange = (): void => void refetch();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void refetch();
    };
    window.addEventListener(TIMER_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener(TIMER_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleStopped = (id: string): void => {
    setRunning((rs) => rs.filter((r) => r.id !== id));
  };
  const handleDeleted = (id: string): void => {
    setHistory((hs) => hs.filter((h) => h.id !== id));
  };

  return (
    <>
      {running.length > 0 ? (
        <RunningTimers
          entries={running}
          now={now}
          onStopped={handleStopped}
          autoStackOverlaps={autoStackOverlaps}
        />
      ) : null}
      <TimerHistory
        entries={history}
        onDeleted={handleDeleted}
        autoStackOverlaps={autoStackOverlaps}
      />
    </>
  );
}
```

- [ ] **Step 6: Update `page.tsx`** (SSR the history)

In `apps/web/src/app/(authenticated)/timer/page.tsx`: add the import

```ts
import { listRecentHistory } from '@/lib/services/time-entries';
```

Remove the `dayStart`/`dayEnd` vars and the `today` query from the `Promise.all`. Replace the `today` query with a `listRecentHistory` call, and replace the `initialToday={...}` prop on `<TimerLists>` with `initialHistory`:

```tsx
const now = new Date();
const [autoStackUser, running, historyResult, clients, tags] = await Promise.all([
  prisma().user.findUniqueOrThrow({ where: { id: s.userId }, select: { autoStackOverlaps: true } }),
  prisma().timeEntry.findMany({
    where: { userId: s.userId, companyId: s.activeCompanyId, endedAt: null, deletedAt: null },
    include: { client: true, project: true, tags: { include: { tag: true } } },
    orderBy: { startedAt: 'desc' },
  }),
  listRecentHistory(prisma(), s.userId, s.activeCompanyId, now),
  prisma().client.findMany({
    where: { companyId: s.activeCompanyId, archived: false },
    include: {
      projects: { where: { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  }),
  prisma().tag.findMany({ where: { companyId: s.activeCompanyId }, orderBy: { name: 'asc' } }),
]);
const history = historyResult.ok ? historyResult.value : [];
```

And the `<TimerLists>` props:

```tsx
<TimerLists
  autoStackOverlaps={autoStackUser.autoStackOverlaps}
  initialRunning={running.map((r) => ({
    id: r.id,
    description: r.description,
    clientName: r.client?.name ?? null,
    projectName: r.project?.name ?? null,
    startedAt: r.startedAt.toISOString(),
    tags: r.tags.map((tt) => ({ name: tt.tag.name, color: tt.tag.color })),
  }))}
  initialHistory={history.map((e) => ({
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    projectName: e.projectName,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt!.toISOString(),
    tags: e.tags.map((tt) => ({ name: tt.name, color: tt.color })),
  }))}
/>
```

- [ ] **Step 7: i18n — add `timer.history` strings**

In `apps/web/messages/cs.json`, add a `history` block inside the existing `timer` object (e.g. after `"playAgain"`):

```json
    "history": {
      "empty": "Žádné dokončené záznamy",
      "emptyHint": "Spusťte nahoře nové měření nebo přidejte ruční zápis."
    },
```

Validate: `node -e "JSON.parse(require('node:fs').readFileSync('apps/web/messages/cs.json','utf8'));console.log('ok')"`

- [ ] **Step 8: Typecheck + lint**

Run:

```bash
pnpm --filter @tt/web typecheck
pnpm --filter @tt/web lint
```

Expected: both clean. (Fix any leftover references to the removed `TodayList`/`initialToday`/`today`.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/timer-events.ts "apps/web/src/app/api/v1/timer/route.ts" "apps/web/src/app/(authenticated)/timer" apps/web/messages/cs.json
git commit -m "feat(timer): show grouped recent history on the Stopky page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Remove the Výkaz feature

**Files:** delete `timesheet/`; modify `nav.ts`, `nav.test.ts`, `time-entries.ts`, `time-entries.test.ts`, the three `actions/*.ts`, `cs.json`, `DESCRIPTION.md`.

- [ ] **Step 1: Delete the route + drop the nav item + i18n key**

```bash
git rm -r "apps/web/src/app/(authenticated)/timesheet"
```

In `apps/web/src/app/(authenticated)/nav.ts`, delete the line `{ href: '/timesheet', label: 'Výkaz' },` (the `Sledování` group then has only `/timer`).
In `apps/web/messages/cs.json`, delete the `"timesheet": "Výkaz",` line from the `nav` object. (Keep `reports.pdf.title` "Výkaz práce" and `reports.export.lastMonth` — those are PDF labels.)

- [ ] **Step 2: Fix `nav.test.ts`**

Update the four assertions:

- `expect(total).toBe(12)` → `11` (both occurrences — the `navGroups` test and the admin `filterVisibleGroups` test).
- `expect(byLabel['Sledování']).toEqual(['/timer', '/timesheet'])` → `expect(byLabel['Sledování']).toEqual(['/timer'])`.
- In "keeps Sledování and Účet intact for non-admin": `...Sledování...?.items.map((i) => i.href)).toEqual(['/timer', '/timesheet'])` → `toEqual(['/timer'])`.
- The "contains all 12 nav items" test title → "contains all 11 nav items".

Run: `pnpm --filter @tt/web test nav` → expect PASS.

- [ ] **Step 3: Delete `listMyWeek`; fix the tests that used it**

In `apps/web/src/lib/services/time-entries.ts`, delete the entire `listMyWeek` function (the `export async function listMyWeek(...) { ... }` block).
In `apps/web/tests/services/time-entries.test.ts`:

- Remove `listMyWeek,` from the import (keep `listRecentEntries`, which is already imported).
- In the **US-25** test, replace the `listMyWeek(...)` read with the already-imported `listRecentEntries` (same return shape):
  ```ts
  const list = await listRecentEntries(tx, w.user, w.company, 50);
  expect(list.ok).toBe(true);
  if (list.ok) expect(list.value.find((e) => e.id === a.value.id)).toBeUndefined();
  ```
- Delete the whole **US-26 `lists my week grouped by day` test** (it tested `listMyWeek`; US-26 is now covered by `recent.test.ts` + the `listRecentHistory` test).
- Update the file header comment (line 3): remove `US-26,` from the "Covers …" list.

Run: `pnpm --filter @tt/web test time-entries` → expect PASS.

- [ ] **Step 4: Strip `revalidatePath('/timesheet')`**

Delete the `revalidatePath('/timesheet');` line from each site:

- `apps/web/src/lib/actions/time.ts` — 6 occurrences (in `startTimerAction`, `stopTimerAction`, `createManualAction`, `updateEntryAction`, `deleteEntryAction`, `playAgainAction`).
- `apps/web/src/lib/actions/auto-stack.ts` — 1.
- `apps/web/src/lib/actions/catalog.ts` — 1 (in `deleteClientAction`).
  Leave the other `revalidatePath('/timer')` / `revalidatePath('/reports')` calls intact. If a file ends up importing `revalidatePath` but no longer uses it, remove the unused import (lint will flag it).

- [ ] **Step 5: Update `DESCRIPTION.md`**

In `apps/web/src/app/(authenticated)/DESCRIPTION.md`: delete the `/timesheet` table row; update the `/timer` row description to "running timers, recent history grouped by day, quick-start row".

- [ ] **Step 6: Typecheck + lint + targeted tests**

Run:

```bash
pnpm --filter @tt/web typecheck
pnpm --filter @tt/web lint
pnpm --filter @tt/web test nav time-entries
```

Expected: all clean/green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(timer): remove the Výkaz (/timesheet) feature, superseded by timer history" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Docs

**Files:** `docs/reference/features.md`, `docs/architecture/README.md`, `docs/superpowers/specs/2026-06-01-reports-grouped-pdf-export-design.md`.

- [ ] **Step 1: Reword US-26 in `features.md`**

Replace line 41:

```markdown
- **US-26** — User views their recent entries (last ~2 months) grouped by day with daily totals, on the timer page.
```

(US-26 stays in the catalogue; `test:trace` requires it to have ≥1 test reference — satisfied by `recent.test.ts`, the `listRecentHistory` test, and `time-format.test.ts`.)

- [ ] **Step 2: Update `architecture/README.md`**

- Line 32 (the `web` row's page list): remove `/timesheet,` from the inline list of pages.
- Remove the bullet `- **Výkaz** (\`/timesheet\`) — personal current-week day-cards, no grouping, no export.`
- If there's a Stopky/`/timer` description nearby, note that the timer page now shows the running timers plus a recent history grouped by day/month; otherwise add a one-line bullet to that effect.

- [ ] **Step 3: Tidy the prior reports spec (light)**

In `docs/superpowers/specs/2026-06-01-reports-grouped-pdf-export-design.md`, the comparison table / prose mention "Výkaz (/timesheet)". Add a short note that Výkaz was subsequently removed (superseded by the timer history) so the doc isn't misleading. Keep it brief; it's historical.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(timer): relocate US-26 to timer history; drop Výkaz from architecture" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full quality gates + e2e

- [ ] **Step 1: Lint + typecheck + full test + trace**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:trace
```

Expected: all green; `test:trace` **100%** (US-26 covered; no orphaned US). If trace fails on US-26, confirm `features.md` still lists US-26 and that `recent.test.ts`/`time-entries.test.ts` name their tests `US-26: …`.

- [ ] **Step 2: Build**

Run: `pnpm --filter @tt/web build`
Expected: success; `/timer` compiles, `/timesheet` is gone.

- [ ] **Step 3: Timer e2e — run + adapt**

These Playwright specs touch the timer page: `apps/web/tests/e2e/destructive-confirm.spec.ts`, `time-entry-edit.spec.ts`, `auto-stack.spec.ts`. Read each and run:

```bash
pnpm --filter @tt/web test:e2e destructive-confirm time-entry-edit auto-stack
```

The "Dnes" label still exists (now a day-group header in `TimerHistory`) and entry rows keep the same description text + ✎/▶/✕ buttons, so most selectors should still match. If any selector targeted the old `TodayList` card structure (e.g. a single "Dnes" card via `CardTitle`), update it to the new grouped markup. Confirm all pass.

- [ ] **Step 4: Commit any gate/e2e fixes**

```bash
git add -A
git commit -m "test(timer): adapt e2e + satisfy gates for timer history" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Skip if nothing changed.)

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage:** reuse `.history` (T2/T3), `listRecentHistory` extraction (T2), Prague-aware grouping (T1), `TimerHistory` replaces `TodayList` (T3), drop `.today` (T3), full Výkaz removal incl. `DESCRIPTION.md` (T4), US-26 relocated + trace 100% (T5/T6), docs (T5). No spec section unmapped.
- [ ] **Type consistency:** `RecentEntryInput`/`RecentDayGroup`/`groupRecentByDay` (T1), `HistoryEntry` (T2), `HistoryEntryView`/`TimerHistory`/`initialHistory` (T3), schema `history` field (T3) used identically across tasks.
- [ ] **No placeholders:** every code step has complete code; every run step has its command + expected result.
