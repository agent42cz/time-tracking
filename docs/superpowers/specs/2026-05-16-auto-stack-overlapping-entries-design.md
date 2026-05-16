# Auto-stack overlapping entries (US-64..US-74)

**Status**: design approved, awaiting implementation plan
**Date**: 2026-05-16
**Owner**: misalenert@gmail.com

## Problem

US-21 explicitly allows multiple parallel timers, so closed entries can overlap on a user's timeline. There is no tooling today to resolve those overlaps. When a user adds a manual past entry (US-23), edits one (US-24 / US-54), or stops a running timer (US-22), and the resulting closed entry overlaps an existing closed entry, the user wants the system to shift the overlapping entry — and any chain it touches — forward so the day reads cleanly as a sequence.

## Goals

- When the user opts in, saving a closed entry that overlaps existing closed entries triggers a cascade that places every affected entry sequentially, preserving each entry's duration.
- The user sees the cascade in a preview dialog before confirming. Silent rewrites are not acceptable.
- Today's behavior (overlap allowed silently) remains the default. Opt-in via a per-user setting keeps the rollout safe.
- One audit row per shifted entry, plus one for the candidate write. Trace coverage stays at 100%.

## Out of scope

- A "compact day" batch tool that operates over a selected range without a candidate write. (Possible future spec.)
- Auto-stack on starting a timer in parallel — explicitly preserved by US-21.
- Cross-user stacking. Each user has an independent timeline.
- Cross-company stacking. Multi-company users get separate timelines per company.
- Pulling entries _backward_ to close gaps. Auto-stack only resolves overlap, not idle time.

## User stories

To be added to `docs/reference/features.md` (trace cap bumps 63 → 74):

- **US-64** — User enables "Automaticky řadit překrývající se záznamy za sebou" in profile settings; off by default.
- **US-65** — With the setting OFF, saving an overlapping closed entry succeeds with no shifts and no dialog (current behavior).
- **US-66** — With the setting ON, saving a non-overlapping closed entry goes through with no dialog flash.
- **US-67** — With the setting ON, saving a closed entry that overlaps an existing closed entry opens a preview dialog listing the candidate's final placement and every cascaded shift. The dialog offers **Posunout a uložit**, **Uložit bez posunu**, **Zrušit**.
- **US-68** — Confirming the preview shifts every affected entry preserving its duration, places the candidate at its final position, and writes one audit row per shifted entry (`action = 'time_entry.shifted_by_auto_stack'`) plus the audit row for the candidate write.
- **US-69** — "Uložit bez posunu" saves the candidate using the existing save path; no shifts; behaves identically to setting OFF for that one save.
- **US-70** — Stopping a running timer triggers auto-stack on the resulting closed entry when the setting is ON.
- **US-71** — Editing an existing closed entry's times (US-54 path) triggers auto-stack; the entry being edited is excluded from the timeline used for planning.
- **US-72** — A cross-company entry id returns MCP-style `not_found` on both the preview endpoint and the save endpoint. No existence leak.
- **US-73** — Two concurrent saves on the same user's day serialize via `SELECT ... FOR UPDATE`; both succeed; no residual overlap.
- **US-74** — When the cascade pushes the final entry's `endedAt` past now, the save still succeeds. The entry is stored with `endedAt > now` and appears in the UI as a normal closed entry. The candidate itself must still satisfy `endedAt ≤ now`.

## Architecture

A single pure planning function lives in `apps/web/src/lib/services/auto-stack.ts`. Two thin call sites use it:

1. **Preview** — `POST /api/time-entries/auto-stack/preview` (or a tRPC query of the same shape). Returns the plan for the dialog.
2. **Save** — `saveEntryWithAutoStack` server action / tRPC mutation. Runs the candidate write and the plan in one Prisma `$transaction` with row-level locks.

Running timers (`endedAt IS NULL`) are never part of the candidate set or the existing-entries set. They stay parallel per US-21.

## Data model

No schema changes to `TimeEntry`. `startedAt` / `endedAt` stay as today. The existing index `@@index([userId, deletedAt, startedAt])` covers the planning-time query.

**New field on `User`**:

```prisma
model User {
  // ...
  autoStackOverlaps Boolean @default(false) @map("auto_stack_overlaps")
}
```

Migration: `add_user_auto_stack_overlaps_default_false`. Default `false` keeps every existing user on current behavior.

**Validation change** in the save path: the candidate entry itself must satisfy `endedAt ≤ now` (unchanged from US-23 / US-54). Entries shifted by the cascade may have `endedAt > now`. This is enforced in service code; there is no DB-level CHECK on `endedAt ≤ now` today, so no migration is required for the relaxation.

**New audit action**: `time_entry.shifted_by_auto_stack` with `meta = { before: { startedAt, endedAt }, after: { startedAt, endedAt }, triggeredBy: <candidate entry id> }`. Added to the `AuditAction` enum / string union wherever it lives.

## Planning function — contract

`apps/web/src/lib/services/auto-stack.ts`:

```ts
export type ClosedEntry = {
  id: string;
  startedAt: Date;
  endedAt: Date;
};

export type Candidate =
  | { kind: 'create'; startedAt: Date; endedAt: Date }
  | { kind: 'edit'; id: string; startedAt: Date; endedAt: Date }
  | { kind: 'stop'; id: string; startedAt: Date; endedAt: Date };

export type Shift = {
  entryId: string;
  before: { startedAt: Date; endedAt: Date };
  after: { startedAt: Date; endedAt: Date };
};

export type Plan = {
  shifts: Shift[];
  candidateAfter: { startedAt: Date; endedAt: Date };
};

export class CandidateEndsInFutureError extends Error {}

export function planAutoStack(input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
}): Plan;
```

### Algorithm

1. If `candidate.endedAt > input.now`, throw `CandidateEndsInFutureError`. The candidate's own time is user-typed and must respect `end ≤ now`.
2. For `'edit'` or `'stop'`, remove the entry with `id === candidate.id` from `existing` (we are rewriting it).
3. Sort the working set by `startedAt`, with `id` ascending as the tie-break.
4. Insert the candidate into the sorted set by `startedAt`.
5. Walk forward from the candidate's index. For each entry `current` with a predecessor `prev`: if `current.startedAt < prev.endedAt`, shift `current` so `current.startedAt = prev.endedAt`, preserving `endedAt - startedAt`. Continue until either no overlap remains or the end of the working set is reached.
6. Emit `shifts[]` for every entry whose times changed (i.e., where `before !== after`). Emit `candidateAfter` separately.

The function never shifts an entry backward, never modifies entries before the candidate, and never modifies the candidate's duration. Determinism is guaranteed by the `(startedAt, id)` sort.

### Window for `existing`

The caller passes the user's closed, non-soft-deleted entries from `candidate.startedAt` to `candidate.startedAt + 7 days`. The save path retries with a 7-day extension if the cascade reaches the window's edge (a shift's `endedAt` lands within 1 hour of the window end). In practice a single 7-day window covers every realistic case.

## Save path

`apps/web/src/lib/actions/save-entry-with-auto-stack.ts`:

1. Open `prisma.$transaction`.
2. Acquire row locks via `$queryRaw` `SELECT id FROM time_entries WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL AND ended_at IS NOT NULL AND started_at >= $3 AND started_at < $4 FOR UPDATE`. Range is the planning window.
3. Re-read the locked set as the authoritative `existing`.
4. Call `planAutoStack({ candidate, existing, now })`.
5. Apply the plan:
   - For `'edit'` / `'stop'`: `update` the candidate's row to `candidateAfter`.
   - For `'create'`: `create` a row at `candidateAfter`.
   - For each `shift`: `update` to `shift.after`.
6. Write `AuditLog` rows: one `time_entry.created` / `time_entry.updated` for the candidate, one `time_entry.shifted_by_auto_stack` per shift.
7. Broadcast a single `time_entries.batch_updated` WebSocket event listing every changed id. Extension and other tabs reload affected rows on receipt.

Concurrent saves on overlapping windows serialize on the row locks; the second transaction's in-transaction read sees the first transaction's shifts and plans on top of them. Both succeed.

## Preview endpoint

Same path as the save action minus the writes: open a read-only transaction, perform the same range read, call `planAutoStack`, return `{ shifts, candidateAfter }`. The dialog calls this whenever the candidate range overlaps an existing closed entry (the UI does the cheap overlap check first to avoid a round-trip for clean saves).

The preview is advisory. The save path re-reads inside the write transaction; the user's "confirm" is approval to shift, not approval of specific final timestamps. The save's actual final timestamps are returned to the client in the response so the UI can reconcile if a concurrent write produced different shifts.

## UI

**Profile setting** in `apps/web/src/app/(authenticated)/settings/page.tsx` (alongside the existing password and TOTP forms):

- Checkbox: `Automaticky řadit překrývající se záznamy za sebou`
- Helper: `Při ukládání záznamu, který se překrývá s jiným, nabídnu jejich přerovnání.`
- Persists to `User.autoStackOverlaps` via a tRPC mutation.

**Preview dialog** — `apps/web/src/components/time/AutoStackPreviewDialog.tsx`:

- Title: `Tento záznam se překrývá s ostatními.`
- Subtitle: `Posunout následující záznamy, aby šly za sebou?`
- List: candidate row marked with ✏, each shifted entry marked with ↪. Each row shows `HH:mm–HH:mm → HH:mm–HH:mm` and a short description with client / project chips.
- Future-end note (conditional): `Poslední záznam končí v {time} (za {duration}).` — shown when the final shift's `endedAt > now`.
- Buttons: `Zrušit` (closes dialog, form stays open), `Uložit bez posunu` (calls existing save endpoint), `Posunout a uložit` (calls `saveEntryWithAutoStack`).

The dialog is opened by the existing save buttons in `EditEntryDialog`, the manual-entry form, and the stop-timer action — each surface calls a single helper `saveEntryWithOverlapCheck` that decides whether to open the preview based on `autoStackOverlaps` and a cheap client-side overlap check against the user's loaded entries for the day.

All strings live in `apps/web/messages/cs.json` under a new `autoStack.*` namespace.

## Edge cases

- **Running timers** (`endedAt IS NULL`) are excluded from `existing`. Stopping a running timer makes its end equal to `now`; that closed entry then becomes the candidate.
- **Candidate that encloses an existing entry**: B 08:00–12:00 vs A 09:00–10:00. A sorts after B by `startedAt`, gets shifted to 12:00–13:00. Consistent with the forward-only rule.
- **Candidate placed inside an existing entry**: B 09:30–10:00 vs A 09:00–11:00. B shifts to 11:00–11:30. A unchanged.
- **Identical `startedAt`**: tie-break by `id` ascending. Deterministic.
- **Cross-day cascade**: a long lunch can push the afternoon into the next calendar day. Reports group by `endedAt` date; entries land in the day they now occupy. Matches the "stack everything" model.
- **Shorter edit**: editing an entry to be shorter does not pull subsequent entries backward to close the gap. Auto-stack resolves overlap, not idle time.
- **Soft-deleted entries** (`deletedAt IS NOT NULL`) are excluded from `existing`.
- **Cross-company isolation**: `existing` is filtered by `userId` AND `companyId`. Multi-company users have independent timelines.
- **Setting OFF**: today's save path runs, no preview, no shifts.
- **Future-ending entries** (`endedAt > now` after a shift): stored as normal closed entries. Reports include them in the day they end. No background scheduler — wall-clock catches up naturally.

## Failure modes

- **Concurrent edit conflict**: two saves on the same window serialize on row locks. Second save's plan is computed against the first's shifts. Both succeed; both write their own audit rows.
- **Preview vs save divergence**: if a concurrent write happens between preview and save, the save's response carries the actual final timestamps. The dialog closes regardless; the day view re-renders from the WebSocket event.
- **Cascade beyond window**: planning function exposes whether any shift's `endedAt` is within 1 hour of the window end. Save path re-plans with a 7-day extension. Hard ceiling of 30 days; beyond that we throw a `CascadeWindowExceededError` and the user sees `Tento posun by zasáhl příliš mnoho dní. Uložte bez posunu.`
- **Candidate `endedAt > now`**: rejected at validation, before the planning function runs. User sees the existing `end ≤ now` error.

## Testing

CLAUDE.md rules: real Postgres + Redis via testcontainers, one US per `it`, cross-company 404s for every read and mutation, `auditCount()` assertions on every mutation.

### Unit (`apps/web/src/lib/services/auto-stack.test.ts`, pure function, no DB)

- Empty `existing` → no shifts.
- Single overlap → one shift, candidate placed first, shifted entry's duration preserved.
- Cascade through 3 entries.
- Candidate inside larger entry → candidate shifts to existing's end.
- Identical `startedAt` tie-break by `id`.
- Cascade pushes final entry past `now` → shift emitted, no throw.
- Candidate's own `endedAt > now` → throws `CandidateEndsInFutureError`.
- Edit case removes the edited entry from `existing` before planning.

### Integration (`apps/web/src/lib/actions/save-entry-with-auto-stack.test.ts`, real DB)

One `it` per user story:

- `US-65: with auto-stack OFF, saving an overlapping closed entry succeeds with no shifts and no dialog`
- `US-66: with auto-stack ON, saving a non-overlapping closed entry succeeds with no shifts`
- `US-67: preview endpoint returns the cascade for a candidate that overlaps existing entries`
- `US-68: confirming the preview shifts the cascade and writes exactly one audit row per shifted entry plus one for the candidate`
- `US-69: "save without shift" path bypasses planAutoStack and behaves identically to setting OFF`
- `US-70: stopping a running timer triggers auto-stack on the resulting closed entry`
- `US-71: editing a closed entry triggers auto-stack with the edited entry excluded from existing`
- `US-72: preview and save endpoints return not_found for a cross-company entry id`
- `US-73: concurrent saves on overlapping windows serialize and produce no residual overlap`
- `US-74: cascade pushing the final entry past now succeeds and stores endedAt > now`
- Running timers (`endedAt IS NULL`) are excluded from existing during planning.
- Soft-deleted entries are excluded from existing during planning.

### E2E (`apps/web/tests/e2e/auto-stack.spec.ts`, Playwright)

- Toggle setting ON in profile → save overlapping manual entry → preview dialog renders Czech strings → click `Posunout a uložit` → day view shows shifted entries.
- Two-tab WebSocket: save in tab 1, tab 2 reflects shifts within 1s (US-31 cadence).

### Trace coverage

`pnpm test:trace` must hit 100% after adding US-64..US-74 to `docs/reference/features.md` and bumping the trace cap.

## Documentation maintenance

- Add US-64..US-74 to `docs/reference/features.md`.
- Add an ADR `0009-auto-stack-overlapping-entries.md` covering: forward-only shift rule, allowing `endedAt > now` for cascade-shifted entries (relaxation of the US-23 / US-54 invariant for shifted entries only), per-user opt-in default OFF.
- Update `docs/architecture/` once implemented.
- No `docs/gotchas.md` entry expected unless implementation surprises us.
