# Remove Výkaz · extension-style history on the Stopky (timer) page

- **Date:** 2026-06-02
- **Status:** Approved design, pending implementation plan
- **User stories:** US-26 (relocated/reworded — see §6), no new US
- **No ADR** (reuses existing patterns; no locked-stack change)

## 1. Problem & intent

Výkaz (`/timesheet`) is a separate tab whose only job is "see my recent entries grouped by
day with daily totals." The Chrome extension already shows a richer version of that — a
**day/month-grouped history** of the last ~2 months — right next to the timer. The user wants
that same history on the web **Stopky** (timer) page, and Výkaz removed entirely.

The new timer history _takes over_ Výkaz's role, which is why Výkaz can go.

## 2. Key enabler (no new API)

`GET /api/v1/timer` (`apps/web/src/app/api/v1/timer/route.ts`) **already returns a `history`
field**: completed entries from `start-of-last-month` to `max(end-of-this-week, end-of-this-month)`,
newest-first, each with client/project names + tags. It's exactly what the extension renders.
Today the web timer page ignores `history` and shows only `today`. So this feature is mostly a
**UI change on the timer page** plus the Výkaz removal.

`today ⊂ history`, so the new history **subsumes** the current "Dnes" list (today becomes the
first day-group).

## 3. Architecture

```
GET /api/v1/timer  ──►  { running, history, summary }   (today dropped — see §3.4)
        │                         ▲
        │                         │ both call
        ▼                         │
listRecentHistory(db, userId, companyId, now)  ── NEW service in time-entries.ts
   (replaces the deleted listMyWeek; the recent-window query, today inline-dup removed)
        │
        ├──► timer/page.tsx (SSR initial history)
        └──► /api/v1/timer route (client refetch)
                  │
                  ▼
        groupRecentByDay(entries, now)  ── ported to apps/web/src/lib/recent.ts, PRAGUE-AWARE
                  │
                  ▼
        TimerHistory.tsx  (replaces TodayList.tsx) — month dividers + day groups + rich rows
```

### 3.1 Shared service — `listRecentHistory` (`apps/web/src/lib/services/time-entries.ts`)

Extract the route's inline `history` query into:

```ts
listRecentHistory(db, userId, companyId, now: Date): Promise<HistoryEntry[]>
```

It returns completed (`endedAt != null`, `deletedAt = null`) entries for the given user+company
in the window `[startOfLastMonth, max(endOfWeek, endOfMonth))` (the route's existing logic, via
`getPeriodRange`), `orderBy startedAt desc`, with client/project/tags included and mapped to a
plain shape (id, description, client{Id,Name}, project{Id,Name}, startedAt, endedAt, tags[]).
This **replaces** `listMyWeek` (deleted). Both `route.ts` and `page.tsx` call it, so the window
logic lives once. (The route keeps computing `summary` from these rows as it does today.)

### 3.2 Grouping — `apps/web/src/lib/recent.ts` (ported, Prague-aware)

Port `groupRecentByDay` + `RecentDayGroup` + the day/month labelers from
`apps/extension/src/recent.ts`, **but bucket by Europe/Prague**, not browser/server-local time:
reuse `dayKey` from `@/lib/time-format` (already `toAppZone`-based) and add Prague-aware
`monthKey`/`monthLabel`/`dayLabel` (via `toAppZone` + the Czech `WEEKDAY_CS`/`MONTH_CS` arrays).
This is required because the web SSRs on UTC containers — local-time bucketing would split days at
the wrong boundary (same class of bug fixed in the reports work). Pure function → unit-testable.

### 3.3 UI — `TimerHistory.tsx` replaces `TodayList.tsx`

- **Layout order (matches the extension):** `TimerStartCard` → `RunningTimers` → **`TimerHistory`**.
- `TimerHistory` takes the flat `history` entries, runs `groupRecentByDay`, and renders:
  - a **month divider** ("Květen 2026") whenever `monthKey` changes between groups,
  - a **day-group header**: label ("Dnes"/"Včera"/"Po 12.05.") + per-day total,
  - the entries as **rich rows** — `TodayList`'s existing `Row` (time range `HH:MM–HH:MM` +
    duration + tag pills + `EditEntryButton` + Play-again + Delete via `useConfirm`) moves into
    `TimerHistory` as `TodayList.tsx` is deleted, so the row behaviour is preserved exactly.
  - empty state when there are no completed entries.
- `TimerLists.tsx`: rename the `today` state/mapper to `history`; the existing refetch reads
  `parsed.data.history` instead of `.today`; `handleDeleted` filters the history list; render
  `<TimerHistory>` instead of `<TodayList>`. Running-timer handling is unchanged.
- `page.tsx`: SSR the initial history via `listRecentHistory` (replacing the inline `today` query);
  pass `initialHistory` to `TimerLists`. Start card / running query unchanged.

### 3.4 `today` field cleanup

After the web switches to `history`, the route's `today` field has no remaining consumer (the
extension uses `history`). Drop the `today` query + field from `route.ts` and from
`TimerStateResponseSchema` (`@/lib/timer-events`) — **after** the plan greps the repo to confirm
no other consumer. If a consumer exists, leave `today` in place (the web simply stops reading it).

## 4. Part B — Remove Výkaz (exhaustive)

**Delete:** `apps/web/src/app/(authenticated)/timesheet/` (`page.tsx`, `TimesheetEntryRow.tsx`).

**Edit:**

- `nav.ts` — remove `{ href: '/timesheet', label: 'Výkaz' }`.
- `nav.test.ts` — total count 12→11; `Sledování` group `['/timer','/timesheet']`→`['/timer']` (the
  admin and non-admin assertions).
- `time-entries.ts` — delete `listMyWeek` (superseded by `listRecentHistory`).
- `time-entries.test.ts` — drop the `listMyWeek` import + the `US-26` week-shape test + header line.
- Strip `revalidatePath('/timesheet')` — `actions/time.ts` (6), `actions/auto-stack.ts` (1),
  `actions/catalog.ts` (1).
- `cs.json` — remove `nav.timesheet` ("Výkaz"). **Keep** `reports.pdf.title` ("Výkaz práce") and
  `reports.export.lastMonth` ("Výkaz za minulý měsíc (PDF)") — those are the PDF export's labels.

No inbound `/timesheet` links exist outside the nav (confirmed by exploration; re-verify in the plan).

## 5. Internationalisation

- New timer-history UI strings (section title, empty state, per-day "total" label) → `cs.json`
  under a `timer.history.*` block. The Czech weekday/month **arrays** live in `recent.ts` as locale
  data (as in the extension), not as per-key i18n entries.
- The timer page already hardcodes some Czech ("Stopky", "Dnes", "Celkem:") — pre-existing and out
  of scope to convert; new strings added go through `cs.json` where practical.

## 6. US-26, tests, docs

- **US-26 is relocated, not deleted.** Its capability — "view my recent entries grouped by day with
  daily totals" — survives on the timer page (wider window, new location). Reword its `features.md`
  line accordingly; `test:trace` stays 100%.
- **Tests:**
  - Unit: `groupRecentByDay` (apps/web) — day grouping, month dividers, per-day totals, and
    **Prague cross-midnight bucketing** (a 23:30 UTC entry lands on the next Prague day). US-26.
  - Integration (testcontainers): `listRecentHistory` — window correctness, `endedAt != null` only,
    user+company scoping, newest-first, and **cross-company isolation** (a user never sees another
    company's entries — mandatory). US-26.
  - Update `nav.test.ts` counts; remove the `listMyWeek` test from `time-entries.test.ts`.
  - Re-run any timer Playwright e2e after the `TodayList`→`TimerHistory` swap (plan verifies which
    exist).
- **Docs:** `architecture/README.md` — drop the Výkaz bullet, note the timer history under Stopky.
  Tidy the Výkaz references in `2026-06-01-reports-grouped-pdf-export-design.md` for accuracy. No ADR.

## 7. Edge cases & error handling

- **Timezone:** all day/month bucketing uses Europe/Prague (§3.2) so SSR (UTC) and client agree.
- **Empty history:** `TimerHistory` shows an empty state; no crash. `groupRecentByDay` already
  tolerates `null`/`undefined`.
- **Running entries:** excluded from history (`endedAt != null`); they stay in `RunningTimers` on top.
- **Cross-company:** `listRecentHistory` filters by `companyId` (from the session/active company);
  no cross-company leakage (tested).
- **Volume:** a heavy user's ~2-month history is tens–low-hundreds of rows; render all (as the
  extension does). No virtualization now; revisit only if it becomes a problem.
- **Mutations:** edit/play-again/delete already fire `notifyTimerChanged` → refetch `/api/v1/timer`
  → history refreshes (unchanged mechanism).

## 8. Non-goals (YAGNI)

No "load more"/deeper paging (recent window only); Reporty stays admin-only; the extension is
untouched; no change to running-timer or start-card behavior; no new API; no virtualization.

## 9. Decisions captured (from brainstorming)

1. Remove Výkaz entirely; the timer history replaces its role.
2. Row style: extension's grouping + depth, with the web's richer rows (time range, tags,
   Edit/Play-again/Delete via ConfirmModal).
3. Depth: the extension's recent ~2-month window only (no load-more); admins use Reporty for
   older data, non-admins accept the same window they already have in the extension.
