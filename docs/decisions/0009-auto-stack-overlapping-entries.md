# 0009 — Auto-stack overlapping entries

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** [auto-stack task force]
- **Related:** US-64..US-74, [`tasks/us-64-74-auto-stack-overlapping-entries.md`](../../tasks/us-64-74-auto-stack-overlapping-entries.md)

## Context

US-21 allows users to run multiple parallel timers on the same calendar day. This means closed time entries on a user's timeline may overlap. Users have requested an opt-in feature to automatically resolve overlaps when saving entries: either by shifting overlapping entries forward in time or backward, to restore a non-overlapping state. This stacking behavior must:

- Be opt-in per user (via `User.autoStackOverlaps` boolean).
- Offer a choice of direction at save time (forward or backward) via a preview dialog.
- Preserve parallel timers (US-21): auto-stack should only fire when entries have an `endedAt` (i.e., on manual create, edit, or stop), not on `startTimer`.
- Handle concurrency safely: multiple simultaneous saves targeting the same user's entry window must serialize and all succeed.

## Decision

We implement auto-stack as a pure planning function (`auto-stack.ts`) that computes the minimal set of entries to shift given a direction, paired with a DB-aware save function (`auto-stack-save.ts`) that applies shifts within a transaction using `SELECT ... FOR UPDATE` row locks.

**User control:** Users enable auto-stack per account in settings (`User.autoStackOverlaps`). When saving an entry with auto-stack enabled, a preview dialog shows the proposed shifts and lets the user choose direction (forward/backward) before committing.

**Data model:**

- Relaxed validation: `endedAt ≤ now` is waived for entries that are cascade-shifted (forward or backward). The entry being saved itself still rejects future `endedAt`.
- New `shift` value on `AuditAction` enum; audit rows for shifted entries include `direction` and `triggeredBy` in the `after` JSON.

**Concurrency:**

- Each auto-stack save acquires row-level locks on all entries it plans to modify (`SELECT ... FOR UPDATE`).
- If a concurrent write lands between preview and save, the save re-reads the current state inside its transaction; the final shift plan may differ from the preview.

## Alternatives considered

### Alternative A — Client-side-only shift preview, server applies on trust

**Rationale for rejection:** Between preview and save, concurrent writes could invalidate the plan. The server would have no way to detect this drift and could apply a stale plan, corrupting user data. Unsafe.

### Alternative B — Shift all non-overlapping entries unconditionally (no direction choice)

**Rationale for rejection:** Users need control over which direction to cascade (forward vs backward) because it affects which calendar days are touched. Removing the choice would force a fixed policy (e.g., always forward), which could push entries into unwanted future dates or earlier dates unexpectedly.

### Alternative C — Relax `endedAt ≤ now` globally for all entries, no special case

**Rationale for rejection:** The relaxation is only safe for entries that are shifted by auto-stack as a side effect of user action. Removing the constraint globally would allow users to directly save entries with future `endedAt` times, which breaks the contract of closed entries being in the past.

## Consequences

### Positive

- Users get opt-in relief from manual stacking, improving UX on busy days.
- Parallel timers (US-21) are preserved — auto-stack does not interfere with concurrent clocks.
- Concurrency is safe: all writes serialize and succeed, with final plan verified at transaction time.
- Audit log captures which entries were shifted, why, and in which direction.

### Negative

- One audit row per shifted entry adds audit-log volume on days with heavy overlap (e.g., user with 10 overlapping entries might create 10 audit rows in a single save).
- Backward shifts may push entries into earlier calendar days; users must be aware of this when choosing direction.
- Preview endpoint is advisory; actual save may differ if concurrent writes land between the two. Users should be informed this is a guide, not a guarantee.

### Neutral

- The `shift` audit action is new, but follows the existing audit-action enum pattern.
- Transaction overhead is minimal for typical overlaps (2–5 entries); high-overlap scenarios (50+ entries) are rare and acceptable.

## Follow-ups

- [ ] Implement `auto-stack.ts` planning logic with unit tests covering all shift algorithms.
- [ ] Implement `auto-stack-save.ts` with transaction and row-lock semantics; integration test concurrent writes.
- [ ] Add `shift` to `AuditAction` enum and update `Audit` schema to store `direction` and `triggeredBy`.
- [ ] Build preview endpoint (`POST /api/timesheets/{userId}/auto-stack-preview`).
- [ ] Build save endpoint (`POST /api/timesheets/{userId}/auto-stack-save`) with dialog UX.
- [ ] Update settings UI to toggle `User.autoStackOverlaps`.
- [ ] E2E test: user enables auto-stack, overlaps entries, preview shows correct shifts, user chooses direction, save applies correctly.
