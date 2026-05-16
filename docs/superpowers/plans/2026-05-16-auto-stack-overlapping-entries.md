# Auto-stack overlapping entries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user opt-in toggle that, on save of a closed `TimeEntry` overlapping an existing closed entry, runs a cascade shift (forward or backward, chosen per save in a preview dialog) and writes one audit row per shifted entry. Implements US-64..US-76 from `docs/superpowers/specs/2026-05-16-auto-stack-overlapping-entries-design.md`.

**Architecture:** Pure planning function in `apps/web/src/lib/services/auto-stack.ts` is called by two new server actions (`previewAutoStackAction`, `saveEntryWithAutoStackAction`). Both run inside `prisma.$transaction` with `SELECT ... FOR UPDATE` row locks for concurrency safety. UI surfaces (`EditEntryDialog`, `TimerStartCard`, `RunningTimers`) go through a shared helper that opens a new `AutoStackPreviewDialog` when the user setting is on. Audit rows use a new `shift` enum value with direction stored in the `after` JSON.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 6, Postgres 16, server actions, `next-intl` (cs.json), Vitest + testcontainers for integration, Playwright for E2E.

**Key references:**

- Spec: `docs/superpowers/specs/2026-05-16-auto-stack-overlapping-entries-design.md`
- Existing service pattern: `apps/web/src/lib/services/time-entries.ts`
- Audit helper: `apps/web/src/lib/services/audit.ts` (`writeAudit(db, input)`)
- Realtime helper: `apps/web/src/lib/realtime.ts` (`publishTimeEntry(type, ctx)`)
- Server actions example: `apps/web/src/lib/actions/time.ts`
- UI surfaces: `apps/web/src/components/time/EditEntryDialog.tsx`, `apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx`, `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`
- Settings page: `apps/web/src/app/(authenticated)/settings/page.tsx`
- Trace tracker: `scripts/test-trace.ts` (TOTAL_US currently 63 — bumps to 76 in final task)
- Features list: `docs/reference/features.md`

---

## File structure

**Create:**

- `apps/web/src/lib/services/auto-stack.ts` — pure planning function (no DB)
- `apps/web/src/lib/services/auto-stack-save.ts` — DB-aware save service (calls planAutoStack, applies plan, writes audit, publishes events)
- `apps/web/src/lib/actions/auto-stack.ts` — server actions: `previewAutoStackAction`, `saveEntryWithAutoStackAction`
- `apps/web/src/lib/actions/settings.ts` — `setAutoStackOverlapsAction(value: boolean)` (new file because no settings-actions file exists yet)
- `apps/web/src/components/time/AutoStackPreviewDialog.tsx` — the preview dialog
- `apps/web/src/components/settings/AutoStackToggle.tsx` — checkbox on settings page
- `apps/web/src/components/time/save-with-overlap-check.ts` — shared client helper used by all three save surfaces
- `apps/web/tests/services/auto-stack.test.ts` — unit tests for planning function
- `apps/web/tests/actions/auto-stack.test.ts` — integration tests for the server actions
- `apps/web/tests/e2e/auto-stack.spec.ts` — Playwright E2E
- `docs/decisions/0009-auto-stack-overlapping-entries.md` — ADR

**Modify:**

- `packages/db/prisma/schema.prisma` — add `User.autoStackOverlaps`, add `shift` to `AuditAction` enum
- `apps/web/src/app/(authenticated)/settings/page.tsx` — mount `AutoStackToggle`
- `apps/web/src/components/time/EditEntryDialog.tsx` — call `saveWithOverlapCheck` instead of the bare `updateEntryAction`
- `apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx` — call `saveWithOverlapCheck` for manual-create flow
- `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx` — call `saveWithOverlapCheck` for stop flow
- `apps/web/messages/cs.json` — add `autoStack.*` namespace
- `docs/reference/features.md` — add US-64..US-76 entries
- `scripts/test-trace.ts` — bump `TOTAL_US` from 63 to 76 (last task only)
- Migration: `packages/db/prisma/migrations/<timestamp>_add_user_auto_stack_overlaps_and_shift_audit_action/migration.sql`

---

## Task 1: Schema changes and migration

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_user_auto_stack_overlaps_and_shift_audit_action/migration.sql` (auto-generated)

- [ ] **Step 1: Add `autoStackOverlaps` to `User` model**

Locate the `User` model in `packages/db/prisma/schema.prisma` (~line 51). Add this field next to other settings (e.g., `theme`):

```prisma
  autoStackOverlaps Boolean @default(false) @map("auto_stack_overlaps")
```

- [ ] **Step 2: Add `shift` value to `AuditAction` enum**

Locate the `AuditAction` enum in `packages/db/prisma/schema.prisma` (~line 26). Add `shift` alongside the existing values:

```prisma
enum AuditAction {
  create
  update
  delete
  restore
  reorder
  shift
  invite
  invite_accepted
  invite_revoked
  remove_member
  role_change
  login
  logout
  totp_enable
  totp_disable
}
```

- [ ] **Step 3: Generate the migration**

Run:

```bash
pnpm --filter @tt/db exec prisma migrate dev --name add_user_auto_stack_overlaps_and_shift_audit_action --schema packages/db/prisma/schema.prisma
```

Expected: Prisma prints a new migration folder under `packages/db/prisma/migrations/`. The generated `migration.sql` should contain `ALTER TABLE "users" ADD COLUMN "auto_stack_overlaps" BOOLEAN NOT NULL DEFAULT false;` and `ALTER TYPE "AuditAction" ADD VALUE 'shift';`.

- [ ] **Step 4: Regenerate Prisma client**

Run:

```bash
pnpm prisma:generate
```

Expected: Prisma reports success. No type errors expected from existing code (we only added new optional surfaces).

- [ ] **Step 5: Type-check workspace**

Run:

```bash
pnpm typecheck
```

Expected: no errors. If there's an exhaustive switch on `AuditAction` somewhere, you'll need to add a case for `'shift'` — but `writeAudit` is a pass-through so it's unlikely.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add user.autoStackOverlaps + shift audit action"
```

---

## Task 2: Add US-64..US-76 to features.md

**Files:**

- Modify: `docs/reference/features.md`

- [ ] **Step 1: Append the new user stories**

After the existing US-63 entry in `docs/reference/features.md`, add a new section "Auto-stack overlapping entries (US-64..US-76)" — match the file's existing heading style. Inside, paste the US-64..US-76 list verbatim from `docs/superpowers/specs/2026-05-16-auto-stack-overlapping-entries-design.md` "User stories" section.

Do **not** yet bump `TOTAL_US` in `scripts/test-trace.ts` — that happens in the final task once all tests are in.

- [ ] **Step 2: Commit**

```bash
git add docs/reference/features.md
git commit -m "docs(features): add US-64..US-76 (auto-stack overlapping entries)"
```

---

## Task 3: Pure planning function — types and scaffolding

**Files:**

- Create: `apps/web/src/lib/services/auto-stack.ts`

- [ ] **Step 1: Create the file with types and a not-yet-implemented function**

```ts
/**
 * Auto-stack planner (US-64..US-76).
 *
 * Pure function. Takes a candidate write and the user's existing closed
 * entries for the affected window and returns a Plan describing every
 * shift. The DB-aware caller applies the plan inside a transaction.
 *
 * Direction is per-save:
 *  - forward: candidate stays put, later overlapping entries shift later
 *  - backward: candidate shifts earlier (endedAt = first earlier-overlapping
 *    entry's startedAt); earlier overlapping entries shift earlier
 *
 * Running timers (endedAt IS NULL) are never passed in via `existing`.
 */

export type ClosedEntry = {
  id: string;
  startedAt: Date;
  endedAt: Date;
};

export type Candidate =
  | { kind: 'create'; startedAt: Date; endedAt: Date }
  | { kind: 'edit'; id: string; startedAt: Date; endedAt: Date }
  | { kind: 'stop'; id: string; startedAt: Date; endedAt: Date };

export type Direction = 'forward' | 'backward';

export type Shift = {
  entryId: string;
  before: { startedAt: Date; endedAt: Date };
  after: { startedAt: Date; endedAt: Date };
};

export type Plan = {
  direction: Direction;
  shifts: Shift[];
  candidateAfter: { startedAt: Date; endedAt: Date };
};

export class CandidateEndsInFutureError extends Error {
  constructor() {
    super('Candidate endedAt is in the future');
  }
}

export function planAutoStack(_input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
}): Plan {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/auto-stack.ts
git commit -m "feat(services): scaffold auto-stack planner with types"
```

---

## Task 4: Forward direction — TDD

**Files:**

- Modify: `apps/web/src/lib/services/auto-stack.ts`
- Create: `apps/web/tests/services/auto-stack.test.ts`

- [ ] **Step 1: Write failing unit tests for the forward direction**

Create `apps/web/tests/services/auto-stack.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CandidateEndsInFutureError,
  planAutoStack,
  type ClosedEntry,
} from '../../src/lib/services/auto-stack.js';

const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

describe('planAutoStack — forward', () => {
  const now = t('23:59');

  it('US-66: empty existing returns no shifts', () => {
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      existing: [],
      now,
      direction: 'forward',
    });
    expect(plan.shifts).toEqual([]);
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:00'), endedAt: t('10:00') });
    expect(plan.direction).toBe('forward');
  });

  it('US-67: single forward overlap shifts the later entry preserving its duration', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'forward',
    });
    expect(plan.shifts).toHaveLength(0);
    // candidate at 09:30, A at 09:00 → A sorts first, candidate after.
    // Wait: forward shifts entries AFTER candidate. Here A starts BEFORE candidate.
    // So the candidate is the one that overlaps with A as predecessor.
    // The algorithm walks forward from candidate's index, but the candidate is
    // at index 1 (after A). prev = A, current = candidate. candidate.startedAt
    // (09:30) < A.endedAt (10:00) → candidate shifts to 10:00–11:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
  });

  it('US-68: cascade through three later entries', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:30'), endedAt: t('11:30') },
      { id: 'C', startedAt: t('12:00'), endedAt: t('13:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:45') },
      existing,
      now,
      direction: 'forward',
    });
    // sorted: A 09:00-10:00, candidate 09:30-10:45, B 10:30-11:30, C 12:00-13:00
    // walk fwd from candidate (idx 1):
    //   candidate vs A (prev): candidate.startedAt 09:30 < A.endedAt 10:00
    //     → candidate shifts to 10:00–11:15 (preserving 1h15 duration)
    //   B vs candidate: B.startedAt 10:30 < candidate.endedAt 11:15
    //     → B shifts to 11:15–12:15 (preserving 1h)
    //   C vs B: C.startedAt 12:00 < B.endedAt 12:15
    //     → C shifts to 12:15–13:15 (preserving 1h)
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:15') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('10:30'), endedAt: t('11:30') },
        after: { startedAt: t('11:15'), endedAt: t('12:15') },
      },
      {
        entryId: 'C',
        before: { startedAt: t('12:00'), endedAt: t('13:00') },
        after: { startedAt: t('12:15'), endedAt: t('13:15') },
      },
    ]);
  });

  it('US-67: candidate placed inside larger entry shifts to existing.endedAt', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('11:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:00') },
      existing,
      now,
      direction: 'forward',
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('11:00'), endedAt: t('11:30') });
    expect(plan.shifts).toEqual([]);
  });

  it('US-67: identical startedAt — tie-break by id ascending', () => {
    const existing: ClosedEntry[] = [{ id: 'Z', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      existing,
      now,
      direction: 'forward',
    });
    // Tie: candidate's effective id is empty string for create (sorts before 'Z'?).
    // Implementation note: for 'create', use '' as the id during sort so it
    // deterministically sorts first when startedAt ties. Verify in algorithm.
    // With candidate first, Z is at index 1; Z.startedAt 09:00 < candidate.endedAt 10:00
    // → Z shifts to 10:00–11:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:00'), endedAt: t('10:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'Z',
        before: { startedAt: t('09:00'), endedAt: t('10:00') },
        after: { startedAt: t('10:00'), endedAt: t('11:00') },
      },
    ]);
  });

  it('US-74: cascade pushing final entry past now still succeeds', () => {
    const fixedNow = t('11:00');
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now: fixedNow,
      direction: 'forward',
    });
    // sorted: A 09-10, candidate 09:30-10:30 (60min), B 10-11
    // walk: candidate vs A → candidate 10:00-11:00. B vs candidate → B 11:00-12:00
    // B.endedAt (12:00) > now (11:00) — allowed per US-74.
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('10:00'), endedAt: t('11:00') },
        after: { startedAt: t('11:00'), endedAt: t('12:00') },
      },
    ]);
  });

  it('throws CandidateEndsInFutureError when candidate.endedAt > now', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('23:00') },
        existing: [],
        now: t('10:00'),
        direction: 'forward',
      }),
    ).toThrow(CandidateEndsInFutureError);
  });

  it('US-71: edit case removes the edited entry from existing before planning', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') }, // being edited
      { id: 'C', startedAt: t('11:00'), endedAt: t('12:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'edit', id: 'B', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'forward',
    });
    // After removing B: [A 09-10, C 11-12]. Insert candidate at 09:30-10:30.
    // walk: candidate vs A → candidate 10-11. C vs candidate → C.startedAt 11 == candidate.endedAt 11, no overlap.
    expect(plan.candidateAfter).toEqual({ startedAt: t('10:00'), endedAt: t('11:00') });
    expect(plan.shifts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @tt/web vitest run apps/web/tests/services/auto-stack.test.ts
```

Expected: all tests fail with `not implemented`.

- [ ] **Step 3: Implement the forward algorithm**

Replace the `planAutoStack` body in `apps/web/src/lib/services/auto-stack.ts`:

```ts
const FUTURE_GRACE_MS = 60_000;

type WorkingEntry = { id: string; startedAt: Date; endedAt: Date };

export function planAutoStack(input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
}): Plan {
  const { candidate, existing, now, direction } = input;

  if (candidate.endedAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    throw new CandidateEndsInFutureError();
  }

  const candidateId = candidate.kind === 'create' ? '' : candidate.id;
  const filtered = existing.filter((e) => e.id !== candidateId);
  const candidateEntry: WorkingEntry = {
    id: candidateId,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
  };

  const working: WorkingEntry[] = [...filtered, candidateEntry].sort((a, b) => {
    const cmp = a.startedAt.getTime() - b.startedAt.getTime();
    if (cmp !== 0) return cmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const originalById = new Map<string, { startedAt: Date; endedAt: Date }>();
  for (const e of filtered) originalById.set(e.id, { startedAt: e.startedAt, endedAt: e.endedAt });

  if (direction === 'forward') {
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    for (let i = candidateIdx; i < working.length; i++) {
      if (i === 0) continue;
      const prev = working[i - 1]!;
      const curr = working[i]!;
      if (curr.startedAt.getTime() < prev.endedAt.getTime()) {
        const duration = curr.endedAt.getTime() - curr.startedAt.getTime();
        working[i] = {
          id: curr.id,
          startedAt: new Date(prev.endedAt),
          endedAt: new Date(prev.endedAt.getTime() + duration),
        };
      }
    }
  } else {
    // backward — implemented in Task 5
    throw new Error('backward not yet implemented');
  }

  const finalCandidate = working.find((e) => e.id === candidateId)!;
  const shifts: Shift[] = [];
  for (const e of working) {
    if (e.id === candidateId) continue;
    const orig = originalById.get(e.id)!;
    if (
      e.startedAt.getTime() !== orig.startedAt.getTime() ||
      e.endedAt.getTime() !== orig.endedAt.getTime()
    ) {
      shifts.push({
        entryId: e.id,
        before: { startedAt: orig.startedAt, endedAt: orig.endedAt },
        after: { startedAt: e.startedAt, endedAt: e.endedAt },
      });
    }
  }
  shifts.sort((a, b) => a.after.startedAt.getTime() - b.after.startedAt.getTime());

  return {
    direction,
    shifts,
    candidateAfter: { startedAt: finalCandidate.startedAt, endedAt: finalCandidate.endedAt },
  };
}
```

- [ ] **Step 4: Run the tests — verify forward tests pass**

```bash
pnpm --filter @tt/web vitest run apps/web/tests/services/auto-stack.test.ts
```

Expected: every `forward` test passes. (Backward tests don't exist yet.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/auto-stack.ts apps/web/tests/services/auto-stack.test.ts
git commit -m "feat(services): forward auto-stack planning function with tests"
```

---

## Task 5: Backward direction — TDD

**Files:**

- Modify: `apps/web/src/lib/services/auto-stack.ts`
- Modify: `apps/web/tests/services/auto-stack.test.ts`

- [ ] **Step 1: Write failing tests for backward direction**

Append a second `describe` block to `apps/web/tests/services/auto-stack.test.ts`:

```ts
describe('planAutoStack — backward', () => {
  const now = t('23:59');

  it('US-75: single backward overlap shifts candidate so endedAt = A.startedAt', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('09:00'), endedAt: t('10:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // A.startedAt 09:00 <= candidate.startedAt 09:30; overlap exists.
    // candidateAfter.endedAt = 09:00, duration 60min → 08:00-09:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([]);
    expect(plan.direction).toBe('backward');
  });

  it('US-75: backward cascade through two earlier entries', () => {
    const existing: ClosedEntry[] = [
      { id: 'C', startedAt: t('07:00'), endedAt: t('08:00') },
      { id: 'B', startedAt: t('07:30'), endedAt: t('08:30') },
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // candidateAfter: 08:00–09:00 (A.startedAt 09:00, duration 60min).
    // walk backward from candidateAfter:
    //   B 07:30-08:30 vs candidate 08:00-09:00 → B.endedAt 08:30 > candidate.startedAt 08:00
    //     → B shifts to 07:00-08:00 (duration 60min, endedAt = 08:00)
    //   C 07:00-08:00 vs B 07:00-08:00 → C.endedAt 08:00 > B.startedAt 07:00
    //     → C shifts to 06:00-07:00 (duration 60min, endedAt = 07:00)
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'B',
        before: { startedAt: t('07:30'), endedAt: t('08:30') },
        after: { startedAt: t('07:00'), endedAt: t('08:00') },
      },
      {
        entryId: 'C',
        before: { startedAt: t('07:00'), endedAt: t('08:00') },
        after: { startedAt: t('06:00'), endedAt: t('07:00') },
      },
    ]);
  });

  it('backward degeneracy: no earlier-overlapping entry → no shifts, candidate stays', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('10:00'), endedAt: t('11:00') }];
    // Candidate 09:30-10:30 overlaps A but A.startedAt 10:00 > candidate.startedAt 09:30 → no earlier dock.
    const plan = planAutoStack({
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('09:30'), endedAt: t('10:30') });
    expect(plan.shifts).toEqual([]);
    expect(plan.direction).toBe('backward');
  });

  it('US-71: edit case removes the edited entry from existing in backward mode too', () => {
    const existing: ClosedEntry[] = [
      { id: 'A', startedAt: t('09:00'), endedAt: t('10:00') },
      { id: 'B', startedAt: t('10:00'), endedAt: t('11:00') }, // being edited
    ];
    const plan = planAutoStack({
      candidate: { kind: 'edit', id: 'B', startedAt: t('09:30'), endedAt: t('10:30') },
      existing,
      now,
      direction: 'backward',
    });
    // After removing B: [A 09-10]. Candidate 09:30-10:30 overlaps A.
    // candidateAfter.endedAt = A.startedAt = 09:00, duration 60min → 08:00-09:00.
    expect(plan.candidateAfter).toEqual({ startedAt: t('08:00'), endedAt: t('09:00') });
    expect(plan.shifts).toEqual([]);
  });

  it('throws CandidateEndsInFutureError regardless of direction', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('23:00') },
        existing: [],
        now: t('10:00'),
        direction: 'backward',
      }),
    ).toThrow(CandidateEndsInFutureError);
  });
});
```

- [ ] **Step 2: Run the failing backward tests**

```bash
pnpm --filter @tt/web vitest run apps/web/tests/services/auto-stack.test.ts -t 'backward'
```

Expected: tests fail with `backward not yet implemented` (the throw in Task 4).

- [ ] **Step 3: Implement backward direction**

Replace the `else { throw ... }` branch in `planAutoStack` with:

```ts
  } else {
    // backward — find first earlier-overlapping entry with startedAt <= candidate.startedAt
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    let dockEntry: WorkingEntry | null = null;
    for (let i = candidateIdx - 1; i >= 0; i--) {
      const earlier = working[i]!;
      const overlaps =
        earlier.endedAt.getTime() > candidateEntry.startedAt.getTime() &&
        earlier.startedAt.getTime() < candidateEntry.endedAt.getTime();
      if (earlier.startedAt.getTime() <= candidateEntry.startedAt.getTime() && overlaps) {
        dockEntry = earlier;
        break;
      }
    }

    if (dockEntry !== null) {
      const candidateDuration = candidateEntry.endedAt.getTime() - candidateEntry.startedAt.getTime();
      const newCandidateEnd = new Date(dockEntry.startedAt);
      const newCandidateStart = new Date(dockEntry.startedAt.getTime() - candidateDuration);
      working[candidateIdx] = {
        id: candidateId,
        startedAt: newCandidateStart,
        endedAt: newCandidateEnd,
      };
      // Re-sort to reflect the candidate's new position.
      working.sort((a, b) => {
        const cmp = a.startedAt.getTime() - b.startedAt.getTime();
        if (cmp !== 0) return cmp;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      // Walk backward from new candidate position; cascade earlier entries.
      const newCandidateIdx = working.findIndex((e) => e.id === candidateId);
      for (let i = newCandidateIdx - 1; i >= 0; i--) {
        const curr = working[i]!;
        const succ = working[i + 1]!;
        if (curr.endedAt.getTime() > succ.startedAt.getTime()) {
          const duration = curr.endedAt.getTime() - curr.startedAt.getTime();
          working[i] = {
            id: curr.id,
            startedAt: new Date(succ.startedAt.getTime() - duration),
            endedAt: new Date(succ.startedAt),
          };
        }
      }
    }
    // If no dockEntry: candidate stays, no shifts. (backward degeneracy.)
  }
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @tt/web vitest run apps/web/tests/services/auto-stack.test.ts
```

Expected: all forward and backward tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/auto-stack.ts apps/web/tests/services/auto-stack.test.ts
git commit -m "feat(services): backward auto-stack direction with tests"
```

---

## Task 6: DB-aware save service

**Files:**

- Create: `apps/web/src/lib/services/auto-stack-save.ts`

- [ ] **Step 1: Create the service file**

```ts
/**
 * Auto-stack save service (US-64..US-76).
 *
 * Locks the user's affected entries with SELECT ... FOR UPDATE, re-reads
 * inside the transaction, calls planAutoStack, applies the plan, writes
 * one audit row per shifted entry plus one for the candidate write, and
 * publishes a time_entry event per changed entry.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { writeAudit } from './audit.js';
import { publishTimeEntry } from '../realtime.js';
import {
  CandidateEndsInFutureError,
  type Candidate,
  type Direction,
  type Plan,
  planAutoStack,
} from './auto-stack.js';

type Db = PrismaClient | Prisma.TransactionClient;

const WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SaveAutoStackResult =
  | { ok: true; candidateId: string; plan: Plan }
  | {
      ok: false;
      reason: 'not_found' | 'invalid_window' | 'future_timestamp' | 'cascade_window_exceeded';
    };

export interface SaveAutoStackInput {
  actorUserId: string;
  companyId: string;
  candidate: Candidate;
  direction: Direction;
  now: Date;
}

/**
 * Lock + plan + apply in a single transaction.
 * The caller is responsible for the outer Prisma client; this opens the tx.
 */
export async function saveEntryWithAutoStack(
  prisma: PrismaClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  return prisma.$transaction(async (tx) => {
    return runInTx(tx, input);
  });
}

async function runInTx(
  tx: Prisma.TransactionClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  const { actorUserId, companyId, candidate, direction, now } = input;

  const windowStart = new Date(candidate.startedAt.getTime() - WINDOW_DAYS * MS_PER_DAY);
  const windowEnd = new Date(candidate.startedAt.getTime() + WINDOW_DAYS * MS_PER_DAY);

  // Cross-company / not-found check for edit/stop kinds.
  if (candidate.kind !== 'create') {
    const existing = await tx.timeEntry.findFirst({
      where: { id: candidate.id, userId: actorUserId, companyId, deletedAt: null },
      select: { id: true, endedAt: true },
    });
    if (existing === null) {
      return { ok: false, reason: 'not_found' };
    }
    if (candidate.kind === 'stop' && existing.endedAt !== null) {
      // Stopping an already-stopped entry → not_found (idempotent semantics).
      return { ok: false, reason: 'not_found' };
    }
  }

  // Lock the user's closed entries in the window.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM time_entries
    WHERE user_id = ${actorUserId}
      AND company_id = ${companyId}
      AND deleted_at IS NULL
      AND ended_at IS NOT NULL
      AND started_at >= ${windowStart}
      AND started_at < ${windowEnd}
    FOR UPDATE
  `;

  // Re-read the locked set as authoritative.
  const existingRows = await tx.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: windowStart, lt: windowEnd },
    },
    select: { id: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'asc' },
  });

  let plan: Plan;
  try {
    plan = planAutoStack({
      candidate,
      existing: existingRows.map((e) => ({
        id: e.id,
        startedAt: e.startedAt,
        endedAt: e.endedAt as Date,
      })),
      now,
      direction,
    });
  } catch (err) {
    if (err instanceof CandidateEndsInFutureError) {
      return { ok: false, reason: 'future_timestamp' };
    }
    throw err;
  }

  // Cascade-window check: bail if any shift lands within 1 hour of either edge.
  const oneHour = 60 * 60 * 1000;
  for (const s of plan.shifts) {
    if (
      s.after.startedAt.getTime() < windowStart.getTime() + oneHour ||
      s.after.endedAt.getTime() > windowEnd.getTime() - oneHour
    ) {
      return { ok: false, reason: 'cascade_window_exceeded' };
    }
  }

  // Apply the plan.
  let candidateId: string;
  if (candidate.kind === 'create') {
    const created = await tx.timeEntry.create({
      data: {
        userId: actorUserId,
        companyId,
        description: '',
        startedAt: plan.candidateAfter.startedAt,
        endedAt: plan.candidateAfter.endedAt,
      },
      select: { id: true },
    });
    candidateId = created.id;
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'create',
      entityType: 'time_entry',
      entityId: candidateId,
      after: {
        startedAt: plan.candidateAfter.startedAt.toISOString(),
        endedAt: plan.candidateAfter.endedAt.toISOString(),
      },
    });
    await publishTimeEntry('time_entry.created', {
      userId: actorUserId,
      companyId,
      entryId: candidateId,
    });
  } else {
    candidateId = candidate.id;
    const before = await tx.timeEntry.findUniqueOrThrow({
      where: { id: candidateId },
      select: { startedAt: true, endedAt: true },
    });
    await tx.timeEntry.update({
      where: { id: candidateId },
      data: {
        startedAt: plan.candidateAfter.startedAt,
        endedAt: plan.candidateAfter.endedAt,
      },
    });
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'update',
      entityType: 'time_entry',
      entityId: candidateId,
      before: {
        startedAt: before.startedAt.toISOString(),
        endedAt: before.endedAt?.toISOString() ?? null,
      },
      after: {
        startedAt: plan.candidateAfter.startedAt.toISOString(),
        endedAt: plan.candidateAfter.endedAt.toISOString(),
      },
    });
    await publishTimeEntry(candidate.kind === 'stop' ? 'timer.stopped' : 'time_entry.updated', {
      userId: actorUserId,
      companyId,
      entryId: candidateId,
    });
  }

  for (const s of plan.shifts) {
    await tx.timeEntry.update({
      where: { id: s.entryId },
      data: { startedAt: s.after.startedAt, endedAt: s.after.endedAt },
    });
    await writeAudit(tx, {
      companyId,
      actorUserId,
      action: 'shift',
      entityType: 'time_entry',
      entityId: s.entryId,
      before: {
        startedAt: s.before.startedAt.toISOString(),
        endedAt: s.before.endedAt.toISOString(),
      },
      after: {
        startedAt: s.after.startedAt.toISOString(),
        endedAt: s.after.endedAt.toISOString(),
        direction: plan.direction,
        triggeredBy: candidateId,
      },
    });
    await publishTimeEntry('time_entry.updated', {
      userId: actorUserId,
      companyId,
      entryId: s.entryId,
    });
  }

  return { ok: true, candidateId, plan };
}

/**
 * Read-only preview — same window read, same plan, no writes.
 */
export async function previewAutoStack(
  prisma: PrismaClient,
  input: SaveAutoStackInput,
): Promise<SaveAutoStackResult> {
  const { actorUserId, companyId, candidate, direction, now } = input;
  const windowStart = new Date(candidate.startedAt.getTime() - WINDOW_DAYS * MS_PER_DAY);
  const windowEnd = new Date(candidate.startedAt.getTime() + WINDOW_DAYS * MS_PER_DAY);

  if (candidate.kind !== 'create') {
    const existing = await prisma.timeEntry.findFirst({
      where: { id: candidate.id, userId: actorUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (existing === null) return { ok: false, reason: 'not_found' };
  }

  const existingRows = await prisma.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: windowStart, lt: windowEnd },
    },
    select: { id: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'asc' },
  });

  let plan: Plan;
  try {
    plan = planAutoStack({
      candidate,
      existing: existingRows.map((e) => ({
        id: e.id,
        startedAt: e.startedAt,
        endedAt: e.endedAt as Date,
      })),
      now,
      direction,
    });
  } catch (err) {
    if (err instanceof CandidateEndsInFutureError) {
      return { ok: false, reason: 'future_timestamp' };
    }
    throw err;
  }

  return { ok: true, candidateId: candidate.kind === 'create' ? '' : candidate.id, plan };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/auto-stack-save.ts
git commit -m "feat(services): saveEntryWithAutoStack + previewAutoStack with FOR UPDATE locks"
```

---

## Task 7: Integration tests for save service

**Files:**

- Create: `apps/web/tests/services/auto-stack-save.test.ts`

Use the existing pattern from `apps/web/tests/services/audit.test.ts` (testcontainers Postgres via `getTestPrisma()` from `@tt/db/test`).

- [ ] **Step 1: Write the integration tests**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getTestPrisma, resetDb } from '@tt/db/test';
import {
  saveEntryWithAutoStack,
  previewAutoStack,
} from '../../src/lib/services/auto-stack-save.js';

let prisma: PrismaClient;
let companyId: string;
let userId: string;
let otherCompanyId: string;
let otherUserId: string;

const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

beforeAll(async () => {
  prisma = await getTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb(prisma);
  const owner = await prisma.user.create({
    data: { email: 'owner@test', passwordHash: 'x', name: 'Owner' },
  });
  userId = owner.id;
  const company = await prisma.company.create({ data: { name: 'Co' } });
  companyId = company.id;
  await prisma.membership.create({
    data: { userId, companyId, role: 'admin' },
  });

  const other = await prisma.user.create({
    data: { email: 'other@test', passwordHash: 'x', name: 'Other' },
  });
  otherUserId = other.id;
  const otherCo = await prisma.company.create({ data: { name: 'Other Co' } });
  otherCompanyId = otherCo.id;
  await prisma.membership.create({
    data: { userId: otherUserId, companyId: otherCompanyId, role: 'admin' },
  });
});

async function makeEntry(startedAt: Date, endedAt: Date | null, uid = userId, cid = companyId) {
  return prisma.timeEntry.create({
    data: { userId: uid, companyId: cid, description: '', startedAt, endedAt },
    select: { id: true },
  });
}

async function auditCount(): Promise<number> {
  return prisma.auditLog.count({ where: { companyId } });
}

describe('saveEntryWithAutoStack', () => {
  it('US-66: non-overlapping create produces zero shifts and one audit row', async () => {
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:00'), endedAt: t('10:00') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.shifts).toEqual([]);
    }
    expect(await auditCount()).toBe(1);
  });

  it('US-68: forward cascade writes one audit row per shifted entry plus one for the candidate', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    // Candidate becomes 10:00-11:00 (after A), B shifts to 11:00-12:00.
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.startedAt.toISOString()).toBe(t('11:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('12:00').toISOString());
    // 1 (create) + 1 (shift B) = 2 audit rows total.
    expect(await auditCount()).toBe(2);
    const shiftAudits = await prisma.auditLog.findMany({
      where: { companyId, action: 'shift' },
    });
    expect(shiftAudits).toHaveLength(1);
    expect((shiftAudits[0]!.after as { direction?: string } | null)?.direction).toBe('forward');
    expect((shiftAudits[0]!.after as { triggeredBy?: string } | null)?.triggeredBy).toBe(
      result.candidateId,
    );
    // Touch unused locals for clarity.
    void a;
  });

  it('US-70: stop-timer kind triggers auto-stack on the resulting closed entry', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const running = await makeEntry(t('09:30'), null);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'stop', id: running.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: running.id } });
    expect(after.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('11:00').toISOString());
  });

  it('US-71: edit kind excludes the edited entry from existing', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: b.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    // After removing B and re-inserting at 09:30: shifts to 10:00-11:00 due to A.
    expect(after.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('11:00').toISOString());
    void a;
  });

  it('US-72: cross-company entry id returns not_found', async () => {
    const otherEntry = await makeEntry(t('09:00'), t('10:00'), otherUserId, otherCompanyId);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: otherEntry.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('US-73: concurrent saves serialize and produce no residual overlap', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const [r1, r2] = await Promise.all([
      saveEntryWithAutoStack(prisma, {
        actorUserId: userId,
        companyId,
        candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
        direction: 'forward',
        now: t('23:59'),
      }),
      saveEntryWithAutoStack(prisma, {
        actorUserId: userId,
        companyId,
        candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
        direction: 'forward',
        now: t('23:59'),
      }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const all = await prisma.timeEntry.findMany({
      where: { userId, companyId, deletedAt: null },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true },
    });
    // No overlaps anywhere.
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.startedAt.getTime()).toBeGreaterThanOrEqual(all[i - 1]!.endedAt!.getTime());
    }
  });

  it('US-74: forward cascade past now succeeds; shifted entry has endedAt > now', async () => {
    const fixedNow = t('11:00');
    await makeEntry(t('09:00'), t('10:00'));
    const b = await makeEntry(t('10:00'), t('11:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.endedAt!.getTime()).toBeGreaterThan(fixedNow.getTime());
  });

  it('US-75: backward direction shifts candidate earlier and writes direction=backward audit', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'backward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const created = await prisma.timeEntry.findUniqueOrThrow({ where: { id: result.candidateId } });
    expect(created.startedAt.toISOString()).toBe(t('08:00').toISOString());
    expect(created.endedAt?.toISOString()).toBe(t('09:00').toISOString());
    void a;
  });

  it('US-76: parallel timers — stopping the second triggers auto-stack', async () => {
    // T1 closed (just stopped earlier). T2 still running.
    await makeEntry(t('10:00'), t('11:00')); // T1 already stopped
    const t2 = await makeEntry(t('10:30'), null); // T2 running
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'stop', id: t2.id, startedAt: t('10:30'), endedAt: t('12:00') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    const after = await prisma.timeEntry.findUniqueOrThrow({ where: { id: t2.id } });
    expect(after.startedAt.toISOString()).toBe(t('11:00').toISOString());
    expect(after.endedAt?.toISOString()).toBe(t('12:30').toISOString());
  });

  it('soft-deleted entries are excluded from existing', async () => {
    const a = await makeEntry(t('09:00'), t('10:00'));
    await prisma.timeEntry.update({ where: { id: a.id }, data: { deletedAt: t('00:00') } });
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.plan.shifts).toEqual([]);
    expect(result.plan.candidateAfter).toEqual({ startedAt: t('09:30'), endedAt: t('10:30') });
  });

  it('running timers are excluded from existing', async () => {
    await makeEntry(t('09:00'), null); // running
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.plan.shifts).toEqual([]);
  });
});

describe('previewAutoStack', () => {
  it('US-67: returns plan for both directions when called twice', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const fwd = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    const back = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'create', startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'backward',
      now: t('23:59'),
    });
    expect(fwd.ok).toBe(true);
    expect(back.ok).toBe(true);
    if (!fwd.ok || !back.ok) throw new Error('expected ok');
    expect(fwd.plan.candidateAfter.startedAt.toISOString()).toBe(t('10:00').toISOString());
    expect(back.plan.candidateAfter.startedAt.toISOString()).toBe(t('08:00').toISOString());
  });

  it('US-72: preview returns not_found for cross-company entry id', async () => {
    const otherEntry = await makeEntry(t('09:00'), t('10:00'), otherUserId, otherCompanyId);
    const result = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: otherEntry.id, startedAt: t('09:30'), endedAt: t('10:30') },
      direction: 'forward',
      now: t('23:59'),
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
```

- [ ] **Step 2: Run the integration tests**

```bash
pnpm --filter @tt/web vitest run apps/web/tests/services/auto-stack-save.test.ts
```

Expected: all tests pass. If `getTestPrisma` / `resetDb` aren't exported under those names from `@tt/db/test`, mirror the actual helper names used in `apps/web/tests/services/audit.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/services/auto-stack-save.test.ts
git commit -m "test(services): integration tests for saveEntryWithAutoStack + previewAutoStack"
```

---

## Task 8: Server actions

**Files:**

- Create: `apps/web/src/lib/actions/auto-stack.ts`
- Create: `apps/web/src/lib/actions/settings.ts`

- [ ] **Step 1: Create the auto-stack actions file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from '../auth/session.js';
import { prisma } from '../prisma.js';
import {
  previewAutoStack,
  saveEntryWithAutoStack,
  type SaveAutoStackInput,
  type SaveAutoStackResult,
} from '../services/auto-stack-save.js';
import type { Candidate, Direction } from '../services/auto-stack.js';

export type AutoStackActionInput = {
  candidate: {
    kind: 'create' | 'edit' | 'stop';
    id?: string;
    startedAt: string;
    endedAt: string;
  };
  direction: Direction;
};

// Server actions serialize Date objects to ISO strings over the wire.
// The wire-shape of the plan replaces Date fields with strings.
export type WirePlan = {
  direction: Direction;
  shifts: Array<{
    entryId: string;
    before: { startedAt: string; endedAt: string };
    after: { startedAt: string; endedAt: string };
  }>;
  candidateAfter: { startedAt: string; endedAt: string };
};

export type AutoStackActionResult =
  | { ok: true; candidateId: string; plan: WirePlan }
  | {
      ok: false;
      error:
        | 'unauthorized'
        | 'not_found'
        | 'invalid_window'
        | 'future_timestamp'
        | 'cascade_window_exceeded';
    };

function planToWire(plan: import('../services/auto-stack.js').Plan): WirePlan {
  return {
    direction: plan.direction,
    shifts: plan.shifts.map((s) => ({
      entryId: s.entryId,
      before: {
        startedAt: s.before.startedAt.toISOString(),
        endedAt: s.before.endedAt.toISOString(),
      },
      after: { startedAt: s.after.startedAt.toISOString(), endedAt: s.after.endedAt.toISOString() },
    })),
    candidateAfter: {
      startedAt: plan.candidateAfter.startedAt.toISOString(),
      endedAt: plan.candidateAfter.endedAt.toISOString(),
    },
  };
}

function parseInput(input: AutoStackActionInput): Candidate {
  const startedAt = new Date(input.candidate.startedAt);
  const endedAt = new Date(input.candidate.endedAt);
  if (input.candidate.kind === 'create') {
    return { kind: 'create', startedAt, endedAt };
  }
  return { kind: input.candidate.kind, id: input.candidate.id!, startedAt, endedAt };
}

export async function previewAutoStackAction(
  input: AutoStackActionInput,
): Promise<AutoStackActionResult> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  const candidate = parseInput(input);
  const result = await previewAutoStack(prisma, {
    actorUserId: session.userId,
    companyId: session.companyId,
    candidate,
    direction: input.direction,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: result.reason };
  return { ok: true, candidateId: result.candidateId, plan: planToWire(result.plan) };
}

export async function saveEntryWithAutoStackAction(
  input: AutoStackActionInput,
): Promise<AutoStackActionResult> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  const candidate = parseInput(input);
  const result = await saveEntryWithAutoStack(prisma, {
    actorUserId: session.userId,
    companyId: session.companyId,
    candidate,
    direction: input.direction,
    now: new Date(),
  });
  if (!result.ok) return { ok: false, error: result.reason };
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true, candidateId: result.candidateId, plan: planToWire(result.plan) };
}
```

Note: the exact imports for `getServerSession` and `prisma` are the same as those used by `apps/web/src/lib/actions/time.ts`. Mirror that file's imports verbatim if the paths above don't resolve.

- [ ] **Step 2: Create the settings action**

`apps/web/src/lib/actions/settings.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from '../auth/session.js';
import { prisma } from '../prisma.js';

export type ActionResult = { ok: true } | { ok: false; error: 'unauthorized' };

export async function setAutoStackOverlapsAction(value: boolean): Promise<ActionResult> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  await prisma.user.update({
    where: { id: session.userId },
    data: { autoStackOverlaps: value },
  });
  revalidatePath('/settings');
  return { ok: true };
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean. Fix the imports for `getServerSession` and `prisma` to match what `apps/web/src/lib/actions/time.ts` uses.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/actions/auto-stack.ts apps/web/src/lib/actions/settings.ts
git commit -m "feat(actions): preview + save server actions for auto-stack"
```

---

## Task 9: i18n strings

**Files:**

- Modify: `apps/web/messages/cs.json`

- [ ] **Step 1: Add the `autoStack` namespace to `cs.json`**

Open `apps/web/messages/cs.json`. Add a new top-level key `autoStack` with the strings used by `AutoStackPreviewDialog` and `AutoStackToggle`. The exact structure (mirror existing namespaces):

```json
{
  "autoStack": {
    "settingLabel": "Automaticky řadit překrývající se záznamy za sebou",
    "settingHelper": "Při ukládání záznamu, který se překrývá s jiným, nabídnu jejich přerovnání.",
    "dialogTitle": "Tento záznam se překrývá s ostatními.",
    "dialogSubtitle": "Posunout záznamy, aby šly za sebou?",
    "directionForward": "Vpřed",
    "directionBackward": "Zpět",
    "candidateRowLabel": "Tento záznam",
    "futureEndNote": "Poslední záznam končí v {time} (za {duration}).",
    "crossDayNote": "Posun zasahuje do dne {date}.",
    "degeneracyNote": "Zpětný posun zde nemá efekt — záznam zůstává na svém čase.",
    "cancel": "Zrušit",
    "saveWithoutShift": "Uložit bez posunu",
    "saveWithShift": "Posunout a uložit",
    "errorCascadeWindow": "Tento posun by zasáhl příliš mnoho dní. Uložte bez posunu."
  }
}
```

- [ ] **Step 2: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/cs.json','utf8'))"
```

Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/cs.json
git commit -m "i18n(cs): add autoStack namespace strings"
```

---

## Task 10: AutoStackToggle component on settings page

**Files:**

- Create: `apps/web/src/components/settings/AutoStackToggle.tsx`
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Create the toggle component**

```tsx
'use client';

import { useTransition, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { setAutoStackOverlapsAction } from '@/lib/actions/settings';

export function AutoStackToggle({ initialValue }: { initialValue: boolean }): ReactElement {
  const t = useTranslations('autoStack');
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        defaultChecked={initialValue}
        disabled={pending}
        className="mt-1"
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            await setAutoStackOverlapsAction(next);
          });
        }}
      />
      <span className="flex flex-col">
        <span className="font-medium">{t('settingLabel')}</span>
        <span className="text-sm text-muted-foreground">{t('settingHelper')}</span>
      </span>
    </label>
  );
}
```

- [ ] **Step 2: Mount on the settings page**

Open `apps/web/src/app/(authenticated)/settings/page.tsx`. Read it to find where `ChangePasswordForm` and `TotpManager` are rendered. Add a Card section above or below them containing `<AutoStackToggle initialValue={user.autoStackOverlaps} />`. The page is a server component that fetches the current user — pass `user.autoStackOverlaps` through.

Locate the user-fetch and rendering pattern in the page. Add the import:

```ts
import { AutoStackToggle } from '@/components/settings/AutoStackToggle';
```

And in the JSX, mirror the existing Card pattern:

```tsx
<Card>
  <CardHeader>
    <CardTitle>{t('autoStack.settingLabel')}</CardTitle>
  </CardHeader>
  <CardContent>
    <AutoStackToggle initialValue={user.autoStackOverlaps} />
  </CardContent>
</Card>
```

If the page's user query doesn't currently `select` the `autoStackOverlaps` column, add it to the `select` block.

- [ ] **Step 3: Type-check and build**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 4: Manual verify in browser**

Run:

```bash
pnpm db:up && pnpm --filter @tt/web dev
```

Open `http://localhost:3000/settings`, toggle the new checkbox, refresh, confirm the checkbox state persists. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings/AutoStackToggle.tsx apps/web/src/app/(authenticated)/settings/page.tsx
git commit -m "feat(settings): autoStackOverlaps toggle on settings page"
```

---

## Task 11: AutoStackPreviewDialog component

**Files:**

- Create: `apps/web/src/components/time/AutoStackPreviewDialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
'use client';

import { useEffect, useState, useTransition, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@tt/ui';
import {
  previewAutoStackAction,
  saveEntryWithAutoStackAction,
  type AutoStackActionInput,
  type AutoStackActionResult,
} from '@/lib/actions/auto-stack';

type Direction = 'forward' | 'backward';
type Plan = Extract<AutoStackActionResult, { ok: true }>['plan']; // = WirePlan; all timestamps are ISO strings

export type AutoStackPreviewDialogProps = {
  open: boolean;
  candidate: AutoStackActionInput['candidate'];
  onClose: () => void;
  onSaveWithoutShift: () => Promise<void>;
  onShifted: (candidateId: string) => void;
};

function formatRange(startedAt: Date | string, endedAt: Date | string): string {
  const fmt = (d: Date | string): string => {
    const dd = typeof d === 'string' ? new Date(d) : d;
    return dd.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };
  return `${fmt(startedAt)}–${fmt(endedAt)}`;
}

export function AutoStackPreviewDialog(props: AutoStackPreviewDialogProps): ReactElement | null {
  const { open, candidate, onClose, onSaveWithoutShift, onShifted } = props;
  const t = useTranslations('autoStack');
  const [direction, setDirection] = useState<Direction>('forward');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPlan(null);
    startTransition(async () => {
      const result = await previewAutoStackAction({ candidate, direction });
      if (result.ok) {
        setPlan(result.plan);
      } else {
        setError(result.error);
      }
    });
  }, [open, direction, candidate]);

  if (!open) return null;

  const handleSave = (): void => {
    startTransition(async () => {
      const result = await saveEntryWithAutoStackAction({ candidate, direction });
      if (result.ok) {
        onShifted(result.candidateId);
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  const isBackwardDegenerate =
    direction === 'backward' &&
    plan !== null &&
    plan.shifts.length === 0 &&
    new Date(plan.candidateAfter.startedAt).getTime() === new Date(candidate.startedAt).getTime();

  return (
    <ConfirmModal
      open={open}
      title={t('dialogTitle')}
      onCancel={onClose}
      cancelLabel={t('cancel')}
      confirmLabel={t('saveWithShift')}
      onConfirm={handleSave}
      confirmDisabled={pending || plan === null || isBackwardDegenerate}
    >
      <p className="mb-3">{t('dialogSubtitle')}</p>
      <div role="tablist" className="flex gap-2 mb-4">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          className={`px-3 py-1 rounded ${direction === 'forward' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          onClick={() => setDirection('forward')}
          disabled={pending}
        >
          {t('directionForward')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'backward'}
          className={`px-3 py-1 rounded ${direction === 'backward' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          onClick={() => setDirection('backward')}
          disabled={pending}
        >
          {t('directionBackward')}
        </button>
      </div>

      {plan && (
        <ul className="space-y-1 text-sm">
          <li>
            <span className="inline-block w-5">✏</span>
            {t('candidateRowLabel')}{' '}
            <code>
              {formatRange(candidate.startedAt, candidate.endedAt)} →{' '}
              {formatRange(plan.candidateAfter.startedAt, plan.candidateAfter.endedAt)}
            </code>
          </li>
          {plan.shifts.map((s) => (
            <li key={s.entryId}>
              <span className="inline-block w-5">{direction === 'forward' ? '↪' : '↩'}</span>
              <code>
                {formatRange(s.before.startedAt, s.before.endedAt)} →{' '}
                {formatRange(s.after.startedAt, s.after.endedAt)}
              </code>
            </li>
          ))}
        </ul>
      )}

      {isBackwardDegenerate && (
        <p className="mt-3 text-sm text-muted-foreground">{t('degeneracyNote')}</p>
      )}

      {error === 'cascade_window_exceeded' && (
        <p className="mt-3 text-sm text-destructive">{t('errorCascadeWindow')}</p>
      )}

      <button
        type="button"
        className="mt-4 underline text-sm"
        onClick={() => {
          startTransition(async () => {
            await onSaveWithoutShift();
            onClose();
          });
        }}
        disabled={pending}
      >
        {t('saveWithoutShift')}
      </button>
    </ConfirmModal>
  );
}
```

If `ConfirmModal` has a different prop shape, adjust to match. Read `packages/ui/src/confirm-modal.tsx` to get the exact API.

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean. Fix component-prop mismatches by reading the actual `ConfirmModal` API.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/time/AutoStackPreviewDialog.tsx
git commit -m "feat(ui): AutoStackPreviewDialog with direction toggle"
```

---

## Task 12: Shared save-with-overlap-check helper

**Files:**

- Create: `apps/web/src/components/time/save-with-overlap-check.ts`

- [ ] **Step 1: Create the helper**

```ts
'use client';

import { previewAutoStackAction } from '@/lib/actions/auto-stack';
import type { AutoStackActionInput } from '@/lib/actions/auto-stack';

export type OverlapCheckResult =
  | { kind: 'no-overlap' }
  | { kind: 'overlap'; candidate: AutoStackActionInput['candidate'] }
  | { kind: 'error'; error: string };

/**
 * Cheap server round-trip: ask the preview endpoint whether a candidate
 * overlaps any existing closed entry. Returns either 'no-overlap' (caller
 * proceeds with its normal action) or 'overlap' (caller opens the preview
 * dialog).
 */
export async function checkOverlap(
  candidate: AutoStackActionInput['candidate'],
): Promise<OverlapCheckResult> {
  // Probe with direction=forward — any plan with shifts OR a candidateAfter
  // that differs from the request indicates an overlap.
  const probe = await previewAutoStackAction({ candidate, direction: 'forward' });
  if (!probe.ok) {
    return { kind: 'error', error: probe.error };
  }
  const sameStart =
    new Date(probe.plan.candidateAfter.startedAt).getTime() ===
    new Date(candidate.startedAt).getTime();
  const sameEnd =
    new Date(probe.plan.candidateAfter.endedAt).getTime() === new Date(candidate.endedAt).getTime();
  const hasOverlap = probe.plan.shifts.length > 0 || !sameStart || !sameEnd;
  if (!hasOverlap) return { kind: 'no-overlap' };
  return { kind: 'overlap', candidate };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/time/save-with-overlap-check.ts
git commit -m "feat(ui): shared checkOverlap client helper"
```

---

## Task 13: Wire dialog into EditEntryDialog (edit flow)

**Files:**

- Modify: `apps/web/src/components/time/EditEntryDialog.tsx`

- [ ] **Step 1: Read the existing EditEntryDialog**

```bash
cat apps/web/src/components/time/EditEntryDialog.tsx
```

Identify where the existing save submits (the `onConfirm` or similar handler that calls `updateEntryAction`).

- [ ] **Step 2: Modify the save handler**

When the user clicks Save inside `EditEntryDialog`:

1. If the current user has `autoStackOverlaps = false` (prop drilled from the parent server component): call `updateEntryAction` directly as today.
2. If `true`: call `checkOverlap(candidate)`. If `no-overlap`, call `updateEntryAction`. If `overlap`, open `AutoStackPreviewDialog` with `onSaveWithoutShift` falling back to `updateEntryAction`.

Add the new props:

```ts
type Props = {
  // ... existing props
  autoStackOverlaps: boolean;
};
```

Then in the save handler:

```ts
import { checkOverlap } from './save-with-overlap-check';
import { AutoStackPreviewDialog } from './AutoStackPreviewDialog';

// ... inside component
const [autoStackOpen, setAutoStackOpen] = useState(false);
const [autoStackCandidate, setAutoStackCandidate] = useState<
  AutoStackActionInput['candidate'] | null
>(null);

const handleSave = async () => {
  const candidate: AutoStackActionInput['candidate'] = {
    kind: 'edit',
    id: entryId,
    startedAt: form.startedAt,
    endedAt: form.endedAt,
  };
  if (!autoStackOverlaps) {
    await updateEntryAction(entryId /* ...existing patch */);
    onClose();
    return;
  }
  const probe = await checkOverlap(candidate);
  if (probe.kind === 'no-overlap') {
    await updateEntryAction(entryId /* ...existing patch */);
    onClose();
    return;
  }
  if (probe.kind === 'overlap') {
    setAutoStackCandidate(probe.candidate);
    setAutoStackOpen(true);
    return;
  }
  // probe.kind === 'error' — let caller fall back to plain save
  await updateEntryAction(entryId /* ...existing patch */);
  onClose();
};
```

And render the dialog:

```tsx
{
  autoStackOpen && autoStackCandidate && (
    <AutoStackPreviewDialog
      open
      candidate={autoStackCandidate}
      onClose={() => setAutoStackOpen(false)}
      onSaveWithoutShift={async () => {
        await updateEntryAction(entryId /* ...existing patch */);
        onClose();
      }}
      onShifted={() => onClose()}
    />
  );
}
```

- [ ] **Step 3: Pass `autoStackOverlaps` from each call site**

Find every place that renders `<EditEntryDialog ... />` and pass `autoStackOverlaps={user.autoStackOverlaps}` (the parent is already a server component that fetches the user). Required call sites (per the existing manual-edit spec):

- `apps/web/src/app/(authenticated)/timer/TodayList.tsx`
- `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`
- `apps/web/src/app/(authenticated)/timesheet/page.tsx`
- `apps/web/src/app/(authenticated)/dashboard/...` (per-member drill-down)

If any of these doesn't yet fetch the user's `autoStackOverlaps`, add it to the `select` block.

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/time/EditEntryDialog.tsx apps/web/src/app/\(authenticated\)/
git commit -m "feat(ui): edit dialog opens auto-stack preview when setting is on"
```

---

## Task 14: Wire into stop-timer flow

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`

- [ ] **Step 1: Read the file**

```bash
cat apps/web/src/app/(authenticated)/timer/RunningTimers.tsx
```

Identify the stop handler (calls `stopTimerAction`).

- [ ] **Step 2: Modify the stop handler**

Replace the direct `stopTimerAction` call with the same pattern as EditEntryDialog:

```ts
const handleStop = async (entryId: string, startedAt: Date) => {
  const now = new Date();
  const candidate: AutoStackActionInput['candidate'] = {
    kind: 'stop',
    id: entryId,
    startedAt: startedAt.toISOString(),
    endedAt: now.toISOString(),
  };
  if (!autoStackOverlaps) {
    await stopTimerAction(entryId);
    return;
  }
  const probe = await checkOverlap(candidate);
  if (probe.kind === 'no-overlap') {
    await stopTimerAction(entryId);
    return;
  }
  if (probe.kind === 'overlap') {
    setAutoStackCandidate(probe.candidate);
    setAutoStackOpen(true);
    return;
  }
  await stopTimerAction(entryId);
};
```

Pass `autoStackOverlaps` from the parent server component (`timer/page.tsx`).

Render `<AutoStackPreviewDialog />` with `onSaveWithoutShift` calling `stopTimerAction`.

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/timer/RunningTimers.tsx apps/web/src/app/\(authenticated\)/timer/page.tsx
git commit -m "feat(ui): stop-timer flow opens auto-stack preview when setting is on"
```

---

## Task 15: Wire into manual-entry flow

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx`

- [ ] **Step 1: Read the file**

```bash
cat apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx
```

Identify the "Add manual entry" submission (calls `createManualAction`).

- [ ] **Step 2: Modify the submission**

Wrap with the same `checkOverlap` pattern. For `kind: 'create'`, no entry id; just startedAt + endedAt.

```ts
const handleManualSubmit = async (formData: ManualFormData) => {
  const candidate: AutoStackActionInput['candidate'] = {
    kind: 'create',
    startedAt: formData.startedAt,
    endedAt: formData.endedAt,
  };
  if (!autoStackOverlaps) {
    await createManualAction(formData);
    return;
  }
  const probe = await checkOverlap(candidate);
  if (probe.kind === 'no-overlap') {
    await createManualAction(formData);
    return;
  }
  if (probe.kind === 'overlap') {
    setAutoStackCandidate(probe.candidate);
    setAutoStackOpen(true);
    return;
  }
  await createManualAction(formData);
};
```

Pass `autoStackOverlaps` from the parent server component.

Render `<AutoStackPreviewDialog />` with `onSaveWithoutShift` calling `createManualAction(formData)` (capture `formData` in closure or state).

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @tt/web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/timer/TimerStartCard.tsx
git commit -m "feat(ui): manual entry form opens auto-stack preview when setting is on"
```

---

## Task 16: Playwright E2E

**Files:**

- Create: `apps/web/tests/e2e/auto-stack.spec.ts`

- [ ] **Step 1: Find the existing E2E setup**

```bash
ls apps/web/tests/e2e/
cat apps/web/tests/e2e/*.spec.ts | head -100
```

Identify how tests log in and seed data (likely a `setup.ts` helper, or each test creates a user via the API).

- [ ] **Step 2: Write the E2E spec**

```ts
import { test, expect } from '@playwright/test';
import { loginAs, seedUserWithEntries } from './helpers'; // adjust to actual helper names

test('US-67 + US-68: forward direction stacks the candidate after existing entry', async ({
  page,
}) => {
  const user = await seedUserWithEntries({
    autoStackOverlaps: true,
    entries: [{ startedAt: '2026-05-16T09:00:00Z', endedAt: '2026-05-16T10:00:00Z' }],
  });
  await loginAs(page, user);
  await page.goto('/timer');

  // Open manual entry form (selector depends on TimerStartCard structure).
  await page.getByRole('button', { name: /manuální záznam/i }).click();
  await page.getByLabel(/začátek/i).fill('2026-05-16T09:30');
  await page.getByLabel(/konec/i).fill('2026-05-16T10:30');
  await page.getByRole('button', { name: /uložit/i }).click();

  // Preview dialog opens.
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();
  await page.getByRole('button', { name: 'Posunout a uložit' }).click();

  // Day view shows the candidate at 10:00–11:00.
  await expect(page.getByText(/10:00\s*[–-]\s*11:00/)).toBeVisible();
});

test('US-75: switch direction toggle to backward and confirm', async ({ page }) => {
  const user = await seedUserWithEntries({
    autoStackOverlaps: true,
    entries: [{ startedAt: '2026-05-16T09:00:00Z', endedAt: '2026-05-16T10:00:00Z' }],
  });
  await loginAs(page, user);
  await page.goto('/timer');

  await page.getByRole('button', { name: /manuální záznam/i }).click();
  await page.getByLabel(/začátek/i).fill('2026-05-16T09:30');
  await page.getByLabel(/konec/i).fill('2026-05-16T10:30');
  await page.getByRole('button', { name: /uložit/i }).click();

  await page.getByRole('tab', { name: 'Zpět' }).click();
  // Candidate now placed at 08:00–09:00.
  await expect(page.getByText(/08:00\s*[–-]\s*09:00/)).toBeVisible();
  await page.getByRole('button', { name: 'Posunout a uložit' }).click();

  await expect(page.getByText(/08:00\s*[–-]\s*09:00/)).toBeVisible();
});

test('US-65: with setting OFF, saving an overlapping entry shows no dialog', async ({ page }) => {
  const user = await seedUserWithEntries({
    autoStackOverlaps: false,
    entries: [{ startedAt: '2026-05-16T09:00:00Z', endedAt: '2026-05-16T10:00:00Z' }],
  });
  await loginAs(page, user);
  await page.goto('/timer');

  await page.getByRole('button', { name: /manuální záznam/i }).click();
  await page.getByLabel(/začátek/i).fill('2026-05-16T09:30');
  await page.getByLabel(/konec/i).fill('2026-05-16T10:30');
  await page.getByRole('button', { name: /uložit/i }).click();

  // No dialog appears.
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();
  // Both entries exist with overlap intact (today's behavior).
  await expect(page.getByText(/09:00\s*[–-]\s*10:00/)).toBeVisible();
  await expect(page.getByText(/09:30\s*[–-]\s*10:30/)).toBeVisible();
});

test('US-69: "Uložit bez posunu" saves without shifting', async ({ page }) => {
  const user = await seedUserWithEntries({
    autoStackOverlaps: true,
    entries: [{ startedAt: '2026-05-16T09:00:00Z', endedAt: '2026-05-16T10:00:00Z' }],
  });
  await loginAs(page, user);
  await page.goto('/timer');

  await page.getByRole('button', { name: /manuální záznam/i }).click();
  await page.getByLabel(/začátek/i).fill('2026-05-16T09:30');
  await page.getByLabel(/konec/i).fill('2026-05-16T10:30');
  await page.getByRole('button', { name: /uložit/i }).click();

  // Preview dialog opens; pick the bypass option.
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();
  await page.getByRole('button', { name: 'Uložit bez posunu' }).click();

  // Overlap is preserved.
  await expect(page.getByText(/09:00\s*[–-]\s*10:00/)).toBeVisible();
  await expect(page.getByText(/09:30\s*[–-]\s*10:30/)).toBeVisible();
});

test('US-76: parallel timers — stopping the second opens preview dialog', async ({ page }) => {
  const user = await seedUserWithEntries({
    autoStackOverlaps: true,
    entries: [
      // T1 already stopped at 10:00-11:00.
      { startedAt: '2026-05-16T10:00:00Z', endedAt: '2026-05-16T11:00:00Z' },
      // T2 still running, started 10:30.
      { startedAt: '2026-05-16T10:30:00Z', endedAt: null },
    ],
  });
  await loginAs(page, user);
  await page.goto('/timer');

  // Click stop on the running T2.
  await page.getByRole('button', { name: /zastavit/i }).click();

  // Preview dialog opens.
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();
});
```

Adjust selectors, helper imports, and timezone strings to match the actual app.

- [ ] **Step 3: Run E2E tests**

```bash
pnpm --filter @tt/web exec playwright test apps/web/tests/e2e/auto-stack.spec.ts
```

Expected: all three tests pass. Iterate on selectors until they do.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/auto-stack.spec.ts
git commit -m "test(e2e): auto-stack forward, backward, and parallel-timer flows"
```

---

## Task 17: ADR and architecture doc

**Files:**

- Create: `docs/decisions/0009-auto-stack-overlapping-entries.md`
- Modify: `docs/architecture/` (whichever sub-page covers time entries; add a paragraph)

- [ ] **Step 1: Write the ADR**

Use the template at `docs/decisions/_template.md`. Fill in:

- **Title**: 0009 Auto-stack overlapping entries
- **Status**: Accepted
- **Date**: 2026-05-16
- **Context**: US-21 explicitly allows overlap. Users asked for opt-in stacking on save.
- **Decision**: Per-user `User.autoStackOverlaps` boolean (default false). Per-save direction choice (forward/backward) in a preview dialog. Pure planning function + `SELECT ... FOR UPDATE` row locks for concurrency. Relax `endedAt ≤ now` for forward-cascade-shifted entries only. New `shift` value on `AuditAction` enum; direction stored in `after` JSON.
- **Consequences**: One audit row per shifted entry adds audit-log volume on heavily overlapping days. Backward shifts may push entries into earlier calendar days. Concurrent writes on the same user's window block briefly on the row lock.

- [ ] **Step 2: Update architecture doc**

If `docs/architecture/` has a `time-entries.md` or similar, add a one-paragraph section about auto-stack that links the spec and the ADR. Otherwise add a short paragraph to the main architecture page.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0009-auto-stack-overlapping-entries.md docs/architecture/
git commit -m "docs: ADR 0009 + architecture note for auto-stack"
```

---

## Task 18: Bump trace cap and verify 100% coverage

**Files:**

- Modify: `scripts/test-trace.ts`

- [ ] **Step 1: Bump `TOTAL_US`**

Open `scripts/test-trace.ts`. Change:

```ts
const TOTAL_US = 63;
```

to:

```ts
const TOTAL_US = 76;
```

- [ ] **Step 2: Run the trace tracker**

```bash
pnpm test:trace
```

Expected: `US coverage: 76/76 (100%)`. If any US ID is missing, find the relevant test in `apps/web/tests/services/auto-stack.test.ts`, `apps/web/tests/services/auto-stack-save.test.ts`, or `apps/web/tests/e2e/auto-stack.spec.ts` and ensure the `US-NN:` string is present in the test name verbatim.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test:all
```

Expected: lint, typecheck, all unit tests, all integration tests pass. No warnings about parallel test file safety (testcontainers uses `fileParallelism: false`).

- [ ] **Step 4: Commit**

```bash
git add scripts/test-trace.ts
git commit -m "chore(trace): bump TOTAL_US to 76 (US-64..US-76 covered)"
```

---

## Verification checklist (run before finishing the branch)

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` (unit + integration with testcontainers) passes.
- [ ] `pnpm test:trace` reports 76/76 (100%).
- [ ] `pnpm --filter @tt/web exec playwright test` passes locally.
- [ ] Manual smoke: toggle setting on, save overlapping manual entry, see preview, switch direction toggle, save with shift, verify day view.
- [ ] Manual smoke: toggle setting off, save overlapping entry, see no dialog, day view shows overlap (existing behavior).
- [ ] Audit-log review: `prisma.auditLog.findMany({ where: { action: 'shift' } })` returns expected rows with `direction` in the `after` JSON.

---

## Notes for the implementing engineer

- `getServerSession` and the singleton `prisma` import are paths that already exist in `apps/web/src/lib/actions/time.ts`. Open that file first and mirror its imports — those are authoritative.
- The `ConfirmModal` from `@tt/ui` (`packages/ui/src/confirm-modal.tsx`) is the project's standard dialog. Read its props before wiring `AutoStackPreviewDialog`.
- The existing `validateWindow` in `apps/web/src/lib/services/time-entries.ts` has a 60-second future-grace window. The planner mirrors that (`FUTURE_GRACE_MS = 60_000`) so existing edge cases match.
- Czech UI: every string the user sees must come from `apps/web/messages/cs.json`. Time formatting uses `cs-CZ` locale; the app's timezone is `Europe/Prague`. Hard-coded UTC strings in tests work because Vitest runs in the same timezone as Prisma client serialization.
- Audit `action` enum values are short and entity-agnostic (`create`, `update`, `shift`). The `entityType` field (`'time_entry'`) disambiguates.
- Migration safety: the new `autoStackOverlaps` column has `DEFAULT false NOT NULL` — existing users are silently opted out. No backfill needed.
- WebSocket events: `publishTimeEntry` is called per shifted entry; clients receive N `time_entry.updated` events for a cascade of N. This matches existing patterns and the US-31 1-second cadence.
- Concurrency: `$queryRaw ... FOR UPDATE` is the only existing place this raw SQL pattern appears (this feature introduces it). Inside `$transaction`, Postgres releases the locks on commit. Two concurrent saves serialize; both succeed; the second sees the first's shifts.
