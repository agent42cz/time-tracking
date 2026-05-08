# Manual time edit (US-54)

**Status**: design approved, awaiting implementation plan
**Date**: 2026-05-08
**Owner**: misalenert@gmail.com

## Problem

A user starts a timer, forgets about it, and it runs for 5 hours when only 20 minutes of real work happened. There is no UI today to correct the entry's start or end time. The service-layer `updateEntry` already supports this (and admin-edit per US-28 already exists at the service layer), but no surface in the web app exposes it.

## User story

> **US-54** — User (or admin) opens an Edit dialog from any entry list and corrects the entry's start and end times. Editing a running timer with no end specified keeps it running with the new start; supplying an end stops the timer. Validation rules (`end > start`, `start ≤ now`, `end ≤ now`) match manual-entry rules. Every save produces exactly one audit row.

This is added to `docs/reference/features.md` and the trace cap bumps 53 → 54.

## Out of scope

- Editing description, client/project, tags. The service supports them, but the dialog stays focused on time correction. Future spec can extend.
- Extension popup edit. Stop-only stays. Same service action will serve the extension when added.

## Surfaces

A single `<EditEntryDialog>` is reused on four surfaces. Each surface adds an `<EditEntryButton entryId={…} />` that owns local open state.

1. `apps/web/src/app/(authenticated)/timer/TodayList.tsx` — beside ▶ Play and ✕ Delete.
2. `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx` — beside ■ Stop.
3. `apps/web/src/app/(authenticated)/timesheet/page.tsx` — entries grouped by day. The day-row needs a small client component to host the trigger.
4. `apps/web/src/app/(authenticated)/dashboard/...` — admin per-member drill-down (US-38). Promotes the per-member entry row to a small client component.

## Component design

### `EditEntryDialog` (client)

Path: `apps/web/src/components/time/EditEntryDialog.tsx`

Props:

- `entryId: string`
- `initial: { startedAt: string; endedAt: string | null }`
- `open: boolean`
- `onClose(): void`
- `onSaved(updated: { startedAt: string; endedAt: string | null }): void`

Behavior:

- Modal/dialog primitive from `@tt/ui` (or thin local `Dialog` if missing — confirmed during implementation).
- Esc and click-outside dismiss.
- Inputs (Czech via `next-intl`):
  - **Začátek** — `<input type="datetime-local">`, required, defaults to `initial.startedAt`.
  - **Konec** — `<input type="datetime-local">`, optional for running entries (empty placeholder _"Ponechat běžící"_), required for stopped entries (defaults to `initial.endedAt`).
- Read-only **Trvání** label updates live as start/end change. Format: `Hh Mm`. Hidden when end is empty.
- Footer: _Zrušit_ (close) and _Uložit_ (save with `loading` state).

Save flow:

1. Build patch: always include `startedAt`. Include `endedAt` only when the user filled it in (so a running timer can stay running if only start was shifted).
2. Call `updateEntryAction(entryId, patch)`.
3. On success, call `onSaved(updated)` with the new values, close.
4. On `not_found` → toast `"Záznam nelze upravit"` and close.
5. On `invalid_window` → inline error under whichever field caused it (heuristic: if user set end, error sits under end; otherwise under start).
6. On `future_timestamp` → inline error under the offending input.

Time semantics:

- `datetime-local` value is parsed in `Europe/Prague` on the client (matches existing helpers in `@tt/shared/time`).
- For a stopped entry, leaving end blank is a client-side validation error; the user must explicitly delete the entry instead of "un-stopping" it via this dialog.

### `EditEntryButton` (client)

Path: `apps/web/src/components/time/EditEntryButton.tsx`

Thin wrapper that owns dialog open state and renders the trigger button (✎ icon, ghost variant, size sm). Each surface drops it in next to existing actions and passes the entry's current `startedAt` / `endedAt`.

## Server contract

No new service code. `updateEntry` at `apps/web/src/lib/services/time-entries.ts:216` already covers:

- Owner-or-admin check; returns `not_found` on cross-company / unauthorized (no existence leak — constitution rule).
- `validateWindow(startedAt, endedAt, now)` enforces `end > start`, `start ≤ now`, `end ≤ now`. Running entries (`endedAt: null`) are allowed.
- Writes one `update` audit row via `writeAudit` with `before`/`after` snapshots.
- Publishes `time_entry.updated` to Redis pub/sub.

`updateEntryAction` at `apps/web/src/lib/actions/time.ts:69` already exposes this. Implementation step: confirm it accepts `startedAt: Date` and `endedAt: Date | null | undefined` and forwards `invalid_window` / `future_timestamp` reasons cleanly to the client. If the current shape doesn't, the action gets a thin patch — service is untouched.

## Permissions

- Owner edits own entry → allowed.
- Admin edits any company member's entry → allowed (US-28 path).
- Anyone else → `not_found`.

The dialog is unaware of these distinctions; the _trigger button_ only renders on surfaces that have already filtered to permitted entries (today's list = self; admin drill-down = explicit admin route).

## Realtime

`publishTimeEntry('time_entry.updated', …)` already fires after a successful update. Existing `notifyTimerChanged()` in the timer page refetches lists. Timesheet and admin drill-down are server-rendered and refresh on next navigation. No new realtime wiring this spec.

## i18n

New keys under `timeEntry.edit.*` in `apps/web/messages/cs.json`:

- `timeEntry.edit.title` — `"Upravit záznam"`
- `timeEntry.edit.startedAt` — `"Začátek"`
- `timeEntry.edit.endedAt` — `"Konec"`
- `timeEntry.edit.duration` — `"Trvání"`
- `timeEntry.edit.keepRunning` — `"Ponechat běžící"`
- `timeEntry.edit.save` — `"Uložit"`
- `timeEntry.edit.cancel` — `"Zrušit"`
- `timeEntry.edit.errors.invalidWindow` — `"Konec musí být po začátku."`
- `timeEntry.edit.errors.futureTimestamp` — `"Čas nemůže být v budoucnosti."`
- `timeEntry.edit.errors.notFound` — `"Záznam nelze upravit"`
- `timeEntry.edit.errors.endRequiredForStopped` — `"U dokončeného záznamu je konec povinný."`

## Tests

Real Postgres + Redis via testcontainers. One US per `it`, US-54 in test names, cross-company 404, audit row asserted.

### Service layer

In `apps/web/tests/services/time-entries.test.ts`:

- `it('US-54: owner shifts start time on a running timer; entry stays running')`
- `it('US-54: owner sets endedAt on a running timer; entry becomes stopped')`
- `it('US-54: admin corrects another member's stopped entry')`
- `it('US-54: cross-company actor gets not_found when editing entry')`
- `it('US-54: rejects future end timestamp')`
- `it('US-54: rejects end <= start')`
- `it('US-54: rejects shifting start past existing end')`

Where existing US-24 / US-28 tests already cover the assertion, the US-54 tag is added to the existing test name rather than duplicating.

### Action layer

In `apps/web/tests/actions/time.test.ts` (or the equivalent location, confirmed during implementation):

- `it('US-54: updateEntryAction returns invalid_window error for a bad patch')`

### E2E

New file `apps/web/tests/e2e/time-entry-edit.spec.ts`:

- `it('US-54: user opens Edit on today's entry, changes end, sees updated duration')` — golden path.
- `it('US-54: user opens Edit on a running timer, fills end, timer disappears from running list')` — running → stopped via dialog.
- `it('US-54: user opens Edit on a running timer, only shifts start, timer keeps running')` — running stays running.

### Trace gate

`pnpm test:trace` cap bumps 53 → 54. `docs/reference/features.md` gains the US-54 line in the same PR so the gate stays green.

## Rollout

Single PR. No flag, no DB migration, no schema change. Backwards-compatible: only adds UI + reuses existing service.

## Risks

1. **Concurrent edits across tabs** — last-write-wins is the documented project policy (US-34). Dialog reads current values on open; user's save wins. Acceptable.
2. **iOS Safari `datetime-local` quirks** — verified in implementation. Fallback: side-by-side `<input type="date">` + `<input type="time">`. No new dependency either way.
3. **Admin drill-down list is server-rendered today** — small refactor: promote the per-member row to a client component to host the trigger. Bounded, ~30 lines.

## Open items resolved at implementation time

- Confirm `@tt/ui` exports a Dialog primitive; if not, add a thin local one.
- Confirm `updateEntryAction` signature handles the patch shape above.
- Confirm Czech translation keys land cleanly in the existing `cs.json` structure.
