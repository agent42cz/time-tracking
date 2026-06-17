# Extension Auto-Stack Overlap (+ Manual Start Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web app's auto-stack overlap rearrangement to the Chrome extension's stop flow (preview dialog with Forward / Backward / a new Manual tab), and add a new "manual start" planner mode — pin your work's start time and move the earlier blocking entry back — to both clients.

**Architecture:** A new `manual` direction is added to the shared pure planner `planAutoStack` and the DB-aware `saveEntryWithAutoStack`/`previewAutoStack` services. The extension uses REST, so two new v1 routes wrap those services, the existing stop route gains an overlap probe, and `/api/v1/me` starts returning the `autoStackOverlaps` setting. The extension stops the timer as a plain stop, then resolves any overlap via a persistent `tt:pending-overlaps` list so online and offline behave identically.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Next.js 15 route handlers, Prisma 6 + Postgres 16, Vitest + testcontainers (real Postgres, no DB mocks), React 19, `next-intl` (web) / hardcoded Czech (extension), Vite + MV3 extension.

## Global Constraints

- Tech stack is locked — no new libraries, no Prisma→other swaps.
- Tests use **real Postgres + Redis via testcontainers**. No DB mocks, ever.
- One user-story per `it` block; the test name embeds the US ID, e.g. `it('US-82: ...')`.
- **Cross-company 404 tests are mandatory** for every read endpoint and every mutation. Use 404 (`not_found`), never 403.
- **Every mutation produces exactly one audit row per affected entry**; assert via `auditCount()`. Auto-stack writes one row for the candidate plus one `shift` row per moved entry — that is the established pattern.
- Czech UI: web uses `next-intl` (`apps/web/messages/cs.json`), never hardcoded JSX strings. The extension has **no i18n library** — its Czech strings are inline string literals (match the existing `cs.json` autoStack wording).
- No `.only`/`.skip`/`xit`/`xdescribe`; no `console.log` in `apps/` or `packages/`. Pre-commit hook blocks these.
- `pnpm test:trace` (US-coverage tracker) must stay at 100%, including US-77 … US-86.
- Commit messages must **not** include any `Co-Authored-By: Claude` trailer.
- Work happens on branch `feat/extension-auto-stack-overlap` (already created).

---

### Task 1: Planner — add `manual` direction

**Files:**
- Modify: `apps/web/src/lib/services/auto-stack.ts`
- Test: `apps/web/tests/services/auto-stack.test.ts`

**Interfaces:**
- Consumes: existing `Candidate`, `ClosedEntry`, `Shift`, `Plan`, `planAutoStack`.
- Produces:
  - `type Direction = 'forward' | 'backward' | 'manual'`
  - `planAutoStack(input: { candidate; existing; now; direction; manualStartedAt?: Date }): Plan`
  - `class InvalidManualStartError extends Error` (exported)
  - Manual semantics: candidate pinned at `[manualStartedAt, candidate.endedAt]` (does not move); every other entry whose `startedAt < candidate.endedAt` is compacted backward, preserving duration, anchored at `manualStartedAt`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/services/auto-stack.test.ts`:

```ts
describe('planAutoStack — manual', () => {
  const now = t('23:59');

  it('US-82: manual start moves the earlier blocker back, preserving its length', () => {
    // Blocker A 12:30–13:30; candidate ends 14:00; user pins start at 13:00.
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('12:30'), endedAt: t('13:30') }];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.direction).toBe('manual');
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    expect(plan.shifts).toEqual([
      {
        entryId: 'A',
        before: { startedAt: t('12:30'), endedAt: t('13:30') },
        after: { startedAt: t('12:00'), endedAt: t('13:00') },
      },
    ]);
  });

  it('US-82: manual cascade pushes a chain of earlier entries back', () => {
    const existing: ClosedEntry[] = [
      { id: 'EARLY', startedAt: t('11:00'), endedAt: t('11:30') }, // no overlap, stays
      { id: 'MID', startedAt: t('12:50'), endedAt: t('13:10') }, // overlaps after first move
      { id: 'BLOCK', startedAt: t('12:30'), endedAt: t('13:30') },
    ];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    const byId = new Map(plan.shifts.map((s) => [s.entryId, s]));
    // BLOCK (12:30–13:30) anchors at 13:00 → 12:00–13:00.
    expect(byId.get('BLOCK')!.after).toEqual({ startedAt: t('12:00'), endedAt: t('13:00') });
    // MID (12:50–13:10) ends after 12:00 anchor → 11:40–12:00 (20 min preserved).
    expect(byId.get('MID')!.after).toEqual({ startedAt: t('11:40'), endedAt: t('12:00') });
    // EARLY ends 11:30 < 11:40 anchor → untouched.
    expect(byId.has('EARLY')).toBe(false);
  });

  it('US-82: no overlap — candidate just adopts the manual start, no shifts', () => {
    const existing: ClosedEntry[] = [{ id: 'A', startedAt: t('11:00'), endedAt: t('12:00') }];
    const plan = planAutoStack({
      candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:30'), endedAt: t('14:00') },
      existing,
      now,
      direction: 'manual',
      manualStartedAt: t('13:00'),
    });
    expect(plan.candidateAfter).toEqual({ startedAt: t('13:00'), endedAt: t('14:00') });
    expect(plan.shifts).toEqual([]);
  });

  it('US-86: manual start missing throws InvalidManualStartError', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
        existing: [],
        now,
        direction: 'manual',
      }),
    ).toThrow(InvalidManualStartError);
  });

  it('US-86: manual start at/after candidate end throws InvalidManualStartError', () => {
    expect(() =>
      planAutoStack({
        candidate: { kind: 'stop', id: 'CAND', startedAt: t('13:00'), endedAt: t('14:00') },
        existing: [],
        now,
        direction: 'manual',
        manualStartedAt: t('14:00'),
      }),
    ).toThrow(InvalidManualStartError);
  });
});
```

Add `InvalidManualStartError` to the import at the top of the test file:

```ts
import {
  CandidateEndsInFutureError,
  InvalidManualStartError,
  planAutoStack,
  type ClosedEntry,
} from '../../src/lib/services/auto-stack.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tt/web vitest run tests/services/auto-stack.test.ts`
Expected: FAIL — `InvalidManualStartError` is not exported; `'manual'` not assignable to `Direction`.

- [ ] **Step 3: Implement the manual branch**

In `apps/web/src/lib/services/auto-stack.ts`:

Change the `Direction` type (line 27):

```ts
export type Direction = 'forward' | 'backward' | 'manual';
```

Add the error class near `CandidateEndsInFutureError` (after line 45):

```ts
export class InvalidManualStartError extends Error {
  constructor() {
    super('Manual start is missing or not before the candidate end');
  }
}
```

Add `manualStartedAt` to the input signature (line 51-56):

```ts
export function planAutoStack(input: {
  candidate: Candidate;
  existing: ClosedEntry[];
  now: Date;
  direction: Direction;
  manualStartedAt?: Date;
}): Plan {
  const { candidate, existing, now, direction, manualStartedAt } = input;
```

Replace the `if (direction === 'forward') { ... } else { ... }` block (lines 80-163) so the `else` becomes `else if (direction === 'backward')` and a new `else` handles manual. Keep the forward and backward bodies byte-for-byte; only change the branch keywords and append the manual branch:

```ts
  if (direction === 'forward') {
    // ... unchanged forward body ...
  } else if (direction === 'backward') {
    // ... unchanged backward body ...
  } else {
    // manual — candidate is pinned at [manualStartedAt, candidate.endedAt] and
    // does not move. Every other entry that starts before the candidate's end
    // is compacted backward, preserving its duration, anchored at the manual
    // start.
    if (manualStartedAt === undefined || manualStartedAt.getTime() >= candidateEntry.endedAt.getTime()) {
      throw new InvalidManualStartError();
    }
    const pinnedEnd = candidateEntry.endedAt;
    const candidateIdx = working.findIndex((e) => e.id === candidateId);
    working[candidateIdx] = {
      id: candidateId,
      startedAt: new Date(manualStartedAt),
      endedAt: new Date(pinnedEnd),
    };

    const chain = working
      .filter((e) => e.id !== candidateId && e.startedAt.getTime() < pinnedEnd.getTime())
      .sort((a, b) => {
        const cmp = b.startedAt.getTime() - a.startedAt.getTime();
        if (cmp !== 0) return cmp;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      });

    let anchor = new Date(manualStartedAt);
    for (const entry of chain) {
      if (entry.endedAt.getTime() > anchor.getTime()) {
        const duration = entry.endedAt.getTime() - entry.startedAt.getTime();
        const newEnd = new Date(anchor);
        const newStart = new Date(anchor.getTime() - duration);
        const idx = working.findIndex((e) => e.id === entry.id);
        working[idx] = { id: entry.id, startedAt: newStart, endedAt: newEnd };
        anchor = newStart;
      } else {
        anchor = entry.startedAt;
      }
    }

    working.sort((a, b) => {
      const cmp = a.startedAt.getTime() - b.startedAt.getTime();
      if (cmp !== 0) return cmp;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
```

In the shift-sorting tail (lines 183-187), `manual` sorts descending like backward. Change:

```ts
  if (direction === 'forward') {
    shifts.sort((a, b) => a.after.startedAt.getTime() - b.after.startedAt.getTime());
  } else {
    shifts.sort((a, b) => b.after.startedAt.getTime() - a.after.startedAt.getTime());
  }
```

(The existing `else` already covers backward; manual falls into it — no change needed beyond confirming the `else` is reached for `'manual'`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tt/web vitest run tests/services/auto-stack.test.ts`
Expected: PASS (all forward/backward/manual tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/auto-stack.ts apps/web/tests/services/auto-stack.test.ts
git commit -m "feat(auto-stack): add manual direction to planner (US-82, US-86)"
```

---

### Task 2: Save/preview service — thread `manualStartedAt`, manual window, error mapping

**Files:**
- Modify: `apps/web/src/lib/services/auto-stack-save.ts`
- Test: `apps/web/tests/services/auto-stack-save.test.ts`

**Interfaces:**
- Consumes: `planAutoStack`, `InvalidManualStartError`, `Direction` from Task 1.
- Produces:
  - `SaveAutoStackInput` gains `manualStartedAt?: Date`.
  - `SaveAutoStackResult` failure reasons unchanged set (`not_found | invalid_window | future_timestamp | cascade_window_exceeded`); manual errors map to `invalid_window`.
  - For `direction === 'manual'` the lock/read window is the calendar day of `candidate.endedAt`; a manual start outside it (or ≥ end) ⇒ `invalid_window`.

- [ ] **Step 1: Write the failing integration tests**

Append to `apps/web/tests/services/auto-stack-save.test.ts` (inside the existing `describe('saveEntryWithAutoStack', ...)` block, or a new `describe` — use a new one for clarity):

```ts
describe('saveEntryWithAutoStack — manual', () => {
  it('US-82: manual start moves the earlier blocker back and audits one shift', async () => {
    const blocker = await makeEntry(t('12:30'), t('13:30'));
    const stopped = await makeEntry(t('12:45'), t('14:00')); // already closed; we re-place its start
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: stopped.id, startedAt: t('12:45'), endedAt: t('14:00') },
      direction: 'manual',
      manualStartedAt: t('13:00'),
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const cand = await prisma.timeEntry.findUniqueOrThrow({ where: { id: stopped.id } });
    expect(cand.startedAt.toISOString()).toBe(t('13:00').toISOString());
    expect(cand.endedAt?.toISOString()).toBe(t('14:00').toISOString());
    const movedBlocker = await prisma.timeEntry.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(movedBlocker.startedAt.toISOString()).toBe(t('12:00').toISOString());
    expect(movedBlocker.endedAt?.toISOString()).toBe(t('13:00').toISOString());
    // one candidate update + one shift
    expect(await auditCount()).toBe(2);
    const shiftAudits = await prisma.auditLog.findMany({ where: { companyId, action: 'shift' } });
    expect(shiftAudits).toHaveLength(1);
    expect((shiftAudits[0]!.after as { direction?: string }).direction).toBe('manual');
  });

  it('US-86: manual start at/after candidate end returns invalid_window', async () => {
    const stopped = await makeEntry(t('12:45'), t('14:00'));
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: stopped.id, startedAt: t('12:45'), endedAt: t('14:00') },
      direction: 'manual',
      manualStartedAt: t('14:00'),
      now: t('23:59'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('invalid_window');
  });

  it('US-85: manual on a cross-company entry id returns not_found', async () => {
    const foreign = await makeEntry(t('12:45'), t('14:00'), otherUserId, otherCompanyId);
    const result = await saveEntryWithAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: foreign.id, startedAt: t('12:45'), endedAt: t('14:00') },
      direction: 'manual',
      manualStartedAt: t('13:00'),
      now: t('23:59'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('not_found');
  });

  it('US-82: previewAutoStack(manual) returns the plan without writing', async () => {
    const blocker = await makeEntry(t('12:30'), t('13:30'));
    const stopped = await makeEntry(t('12:45'), t('14:00'));
    const before = await auditCount();
    const result = await previewAutoStack(prisma, {
      actorUserId: userId,
      companyId,
      candidate: { kind: 'edit', id: stopped.id, startedAt: t('12:45'), endedAt: t('14:00') },
      direction: 'manual',
      manualStartedAt: t('13:00'),
      now: t('23:59'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.plan.shifts).toHaveLength(1);
    expect(await auditCount()).toBe(before); // no writes
    const stillBlocker = await prisma.timeEntry.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(stillBlocker.startedAt.toISOString()).toBe(t('12:30').toISOString()); // unchanged
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tt/web vitest run tests/services/auto-stack-save.test.ts`
Expected: FAIL — `manualStartedAt` not accepted by `SaveAutoStackInput`; `'manual'` not handled in `computeWindow`.

- [ ] **Step 3: Implement service changes**

In `apps/web/src/lib/services/auto-stack-save.ts`:

Import the new error (line 13-19 import block) — add `InvalidManualStartError`:

```ts
import {
  CandidateEndsInFutureError,
  InvalidManualStartError,
  type Candidate,
  type Direction,
  type Plan,
  planAutoStack,
} from './auto-stack.js';
```

Extend `computeWindow` (lines 28-43) so `manual` uses the same-day window:

```ts
function computeWindow(
  direction: Direction,
  reference: Date,
): {
  windowStart: Date;
  windowEnd: Date;
} {
  if (direction === 'backward' || direction === 'manual') {
    const today = getPeriodRange('today', reference);
    return { windowStart: today.start, windowEnd: today.end };
  }
  return {
    windowStart: new Date(reference.getTime() - WINDOW_DAYS * MS_PER_DAY),
    windowEnd: new Date(reference.getTime() + WINDOW_DAYS * MS_PER_DAY),
  };
}
```

Add `manualStartedAt` to the input interface (lines 52-58):

```ts
export interface SaveAutoStackInput {
  actorUserId: string;
  companyId: string;
  candidate: Candidate;
  direction: Direction;
  now: Date;
  manualStartedAt?: Date;
}
```

In `runInTx` (line 73 destructure, line 75 window): compute the window from the day of `candidate.endedAt` for manual, and validate the manual start. Replace lines 73-75:

```ts
  const { actorUserId, companyId, candidate, direction, now, manualStartedAt } = input;

  const windowRef = direction === 'manual' ? candidate.endedAt : candidate.startedAt;
  const { windowStart, windowEnd } = computeWindow(direction, windowRef);

  if (direction === 'manual') {
    if (
      manualStartedAt === undefined ||
      manualStartedAt.getTime() >= candidate.endedAt.getTime() ||
      manualStartedAt.getTime() < windowStart.getTime()
    ) {
      return { ok: false, reason: 'invalid_window' };
    }
  }
```

Pass `manualStartedAt` into the `planAutoStack` call (lines 119-128) and catch the new error. Replace the try/catch:

```ts
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
      manualStartedAt,
    });
  } catch (err) {
    if (err instanceof CandidateEndsInFutureError) {
      return { ok: false, reason: 'future_timestamp' };
    }
    if (err instanceof InvalidManualStartError) {
      return { ok: false, reason: 'invalid_window' };
    }
    throw err;
  }
```

Apply the **same three edits** to `previewAutoStack` (lines 248-309): the import is shared; update its destructure + window + manual guard (lines 252-253) and its `planAutoStack` call (lines 275-292) identically. Replace lines 252-253:

```ts
  const { actorUserId, companyId, candidate, direction, now, manualStartedAt } = input;
  const windowRef = direction === 'manual' ? candidate.endedAt : candidate.startedAt;
  const { windowStart, windowEnd } = computeWindow(direction, windowRef);

  if (direction === 'manual') {
    if (
      manualStartedAt === undefined ||
      manualStartedAt.getTime() >= candidate.endedAt.getTime() ||
      manualStartedAt.getTime() < windowStart.getTime()
    ) {
      return { ok: false, reason: 'invalid_window' };
    }
  }
```

And the preview's `planAutoStack` try/catch (lines 276-292) gets the same `manualStartedAt,` argument and the same `InvalidManualStartError` catch arm as above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tt/web vitest run tests/services/auto-stack-save.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/auto-stack-save.ts apps/web/tests/services/auto-stack-save.test.ts
git commit -m "feat(auto-stack): thread manual start through save/preview service (US-82, US-85, US-86)"
```

---

### Task 3: Web — server action + dialog "Ručně" tab

**Files:**
- Modify: `apps/web/src/lib/actions/auto-stack.ts`
- Modify: `apps/web/src/components/time/AutoStackPreviewDialog.tsx`
- Modify: `apps/web/messages/cs.json`

**Interfaces:**
- Consumes: `previewAutoStack`/`saveEntryWithAutoStack` (now manual-aware), `Direction` (now includes `'manual'`).
- Produces:
  - `AutoStackActionInput` gains optional `startedAt?: string` (ISO); `VALID_DIRECTIONS` includes `'manual'`.
  - The dialog renders a third tab; when `manual` is selected, a `datetime-local` input drives `startedAt`.

- [ ] **Step 1: Update the action types and pass-through**

In `apps/web/src/lib/actions/auto-stack.ts`:

Add `startedAt` to the input type (lines 8-16):

```ts
export type AutoStackActionInput = {
  candidate: {
    kind: 'create' | 'edit' | 'stop';
    id?: string;
    startedAt: string;
    endedAt: string;
  };
  direction: Direction;
  /** Manual mode only: the user-chosen start (ISO). Ignored otherwise. */
  startedAt?: string;
};
```

Expand `VALID_DIRECTIONS` (line 45):

```ts
const VALID_DIRECTIONS = ['forward', 'backward', 'manual'] as const;
```

In both `previewAutoStackAction` and `saveEntryWithAutoStackAction`, compute `manualStartedAt` and pass it. After `const candidate = parsed.candidate;` in each function add:

```ts
  const manualStartedAt =
    input.direction === 'manual' && typeof input.startedAt === 'string'
      ? new Date(input.startedAt)
      : undefined;
  if (input.direction === 'manual' && (manualStartedAt === undefined || Number.isNaN(manualStartedAt.getTime()))) {
    return { ok: false, error: 'invalid_input' };
  }
```

Then add `manualStartedAt,` to the `previewAutoStack(...)` / `saveEntryWithAutoStack(...)` call objects (after `now: new Date(),`).

- [ ] **Step 2: Add Czech strings**

In `apps/web/messages/cs.json`, inside the `autoStack` object (after `directionBackward`, line 260), add:

```json
    "directionManual": "Ručně",
    "manualStartLabel": "Začátek práce",
```

- [ ] **Step 3: Add the manual tab to the dialog**

In `apps/web/src/components/time/AutoStackPreviewDialog.tsx`:

Change the `Direction` alias (line 13):

```ts
type Direction = 'forward' | 'backward' | 'manual';
```

Add manual-start state after the `direction` state (line 33):

```ts
  const [manualStartedAt, setManualStartedAt] = useState<string>(candidate.startedAt);
```

Reset it when the dialog opens — add to the open effect (inside `if (!open) return;`, line 39-40):

```ts
    setManualStartedAt(candidate.startedAt);
```

Pass `startedAt` into the preview call and re-run on manual changes. Replace the effect body's `previewAutoStackAction` call (line 44) and dependency array (line 53):

```ts
        const result = await previewAutoStackAction({
          candidate,
          direction,
          startedAt: direction === 'manual' ? manualStartedAt : undefined,
        });
```

```ts
  }, [open, direction, candidate, manualStartedAt]);
```

Pass `startedAt` in `handleSave` too (line 59):

```ts
      const result = await saveEntryWithAutoStackAction({
        candidate,
        direction,
        startedAt: direction === 'manual' ? manualStartedAt : undefined,
      });
```

Add the third tab button after the backward `<button>` (after line 114), using a local helper to convert ISO↔`datetime-local`:

```tsx
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'manual'}
          className={`rounded px-3 py-2 sm:py-1 text-sm ${
            direction === 'manual'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('manual')}
          disabled={pending}
        >
          {t('directionManual')}
        </button>
```

After the tablist `</div>` (line 115), render the manual input when manual is selected:

```tsx
      {direction === 'manual' && (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-zinc-700 dark:text-zinc-300">{t('manualStartLabel')}</span>
          <input
            type="datetime-local"
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            value={toLocalInput(manualStartedAt)}
            onChange={(e) => setManualStartedAt(new Date(e.target.value).toISOString())}
            disabled={pending}
          />
        </label>
      )}
```

Add the `toLocalInput` helper at the bottom of the file (after `formatRange`, line 28):

```ts
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 4: Typecheck + lint + build the web app**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint`
Expected: PASS (no hardcoded-string lint errors — all UI copy goes through `t()`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/actions/auto-stack.ts apps/web/src/components/time/AutoStackPreviewDialog.tsx apps/web/messages/cs.json
git commit -m "feat(auto-stack): add manual (Ručně) tab to web preview dialog (US-84)"
```

---

### Task 4: Expose `autoStackOverlaps` in the API session and `/api/v1/me`

**Files:**
- Modify: `apps/web/src/lib/api/auth.ts`
- Modify: `apps/web/src/app/api/v1/me/route.ts`
- Test: `apps/web/tests/services/api-auth-autostack.test.ts` (create)

**Interfaces:**
- Produces: `ApiSession.autoStackOverlaps: boolean`; `/api/v1/me` GET response field `autoStackOverlaps`.

> Harness note (applies to Tasks 4–6): the v1 route tests in this repo do **not** use real bearer tokens or shared `authedRequest`/`makeEntry` helpers. They mock `@/lib/session` (`prisma`) and, for route handlers, `@/lib/api/auth` (`resolveApiSession`), build a `NextRequest` directly, and pass `params` as `{ params: Promise.resolve({ id }) }`. See `apps/web/tests/services/v1-entries-update-route.test.ts`. Read-only paths can run inside `withTx`; `saveEntryWithAutoStack` opens its **own** `$transaction`, so its route test must use the `resetDb` + real-client pattern from `apps/web/tests/services/auto-stack-save.test.ts` (a `withTx` transaction client has no `$transaction` method and would throw).

This task tests the real `resolveApiSession` (not mocked) against a real session token, so it covers the `auth.ts` change directly.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/api-auth-autostack.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createSession } from '../../src/lib/auth/sessions.js';

const ctx = vi.hoisted(() => ({ db: null as unknown as Prisma.TransactionClient }));
// Real resolveApiSession; only the prisma() accessor is redirected to the tx.
vi.mock('@/lib/session', () => ({ prisma: () => ctx.db, SESSION_COOKIE: 'tt-session' }));
const { resolveApiSession } = await import('../../src/lib/api/auth.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

describe('resolveApiSession', () => {
  it('US-77: includes the user autoStackOverlaps setting', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({
        data: { email: 'as@x.test', fullName: 'U', autoStackOverlaps: true },
      });
      const { token } = await createSession(tx, user.id);
      const req = new NextRequest('http://localhost/api/v1/me', {
        headers: { authorization: `Bearer ${token}` },
      });
      const session = await resolveApiSession(req);
      expect(session?.autoStackOverlaps).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tt/web vitest run tests/services/api-auth-autostack.test.ts`
Expected: FAIL — `autoStackOverlaps` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/api/auth.ts`, add the field to the interface (after line 27):

```ts
  theme: ThemePreference;
  autoStackOverlaps: boolean;
```

Select it and return it (the query at line 44 already loads the whole user via `findUnique`, so `user.autoStackOverlaps` is available). Add to the returned object (after line 54):

```ts
    theme: isThemePreference(user.theme) ? user.theme : 'system',
    autoStackOverlaps: user.autoStackOverlaps,
```

In `apps/web/src/app/api/v1/me/route.ts`, add to the GET response (after line 20):

```ts
    theme: session.theme,
    autoStackOverlaps: session.autoStackOverlaps,
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @tt/web vitest run tests/services/api-auth-autostack.test.ts && pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/auth.ts apps/web/src/app/api/v1/me/route.ts apps/web/tests/services/api-auth-autostack.test.ts
git commit -m "feat(api): expose autoStackOverlaps on /api/v1/me (US-77)"
```

---

### Task 5: Stop route — overlap probe

**Files:**
- Modify: `apps/web/src/app/api/v1/timer/[id]/stop/route.ts`
- Test: `apps/web/tests/services/v1-timer-stop-route.test.ts` (create)

**Interfaces:**
- Consumes: `previewAutoStack` (uses `forward`), `session.autoStackOverlaps` from Task 4.
- Produces: stop response shape `{ ok: true, overlap: { entryId: string; startedAt: string; endedAt: string } | null }`.

- [ ] **Step 1: Write the failing tests**

The stop endpoint sets `endedAt = new Date()` (real now), so the seeded closed entry is created **relative to `Date.now()`** to guarantee the overlap. The route reads `previewAutoStack` and `stopTimer` (both run on the tx; neither opens a nested transaction), so `withTx` is fine here. Create `apps/web/tests/services/v1-timer-stop-route.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  userId: '',
  autoStack: false,
}));
vi.mock('@/lib/session', () => ({ prisma: () => ctx.db, SESSION_COOKIE: 'tt-session' }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          autoStackOverlaps: ctx.autoStack,
          memberships: [],
        }
      : null,
  pickActiveCompany: () => null,
}));
const { POST } = await import('../../src/app/api/v1/timer/[id]/stop/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

const HOUR = 3_600_000;
function stopReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/timer/${id}/stop`, { method: 'POST' });
}
const params = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

describe('POST /api/v1/timer/[id]/stop', () => {
  it('US-80: setting ON + overlap returns the overlap payload', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 's1@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'S1', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.autoStack = true;
      await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          description: '',
          startedAt: new Date(Date.now() - 2 * HOUR),
          endedAt: new Date(Date.now() - HOUR / 2),
        },
      });
      const running = await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          description: '',
          startedAt: new Date(Date.now() - HOUR),
          endedAt: null,
        },
      });
      const res = await POST(stopReq(running.id), params(running.id));
      const body = (await res.json()) as { ok: boolean; overlap: { entryId: string } | null };
      expect(body.ok).toBe(true);
      expect(body.overlap?.entryId).toBe(running.id);
    });
  });

  it('US-79: setting ON + no overlap returns overlap: null', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 's2@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'S2', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.autoStack = true;
      const running = await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          description: '',
          startedAt: new Date(Date.now() - HOUR / 2),
          endedAt: null,
        },
      });
      const res = await POST(stopReq(running.id), params(running.id));
      const body = (await res.json()) as { overlap: unknown };
      expect(body.overlap).toBeNull();
    });
  });

  it('US-78: setting OFF returns overlap: null even when entries overlap', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 's3@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'S3', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.autoStack = false;
      await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          description: '',
          startedAt: new Date(Date.now() - 2 * HOUR),
          endedAt: new Date(Date.now() - HOUR / 2),
        },
      });
      const running = await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          description: '',
          startedAt: new Date(Date.now() - HOUR),
          endedAt: null,
        },
      });
      const res = await POST(stopReq(running.id), params(running.id));
      const body = (await res.json()) as { overlap: unknown };
      expect(body.overlap).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tt/web vitest run tests/services/v1-timer-stop-route.test.ts`
Expected: FAIL — `overlap` is `undefined`.

- [ ] **Step 3: Implement the probe**

Replace `apps/web/src/app/api/v1/timer/[id]/stop/route.ts` body:

```ts
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { stopTimer } from '@/lib/services/time-entries';
import { previewAutoStack } from '@/lib/services/auto-stack-save';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const result = await stopTimer(prisma(), session.userId, id);
  if (!result.ok) return errorCors(req, 404, result.reason);

  let overlap: { entryId: string; startedAt: string; endedAt: string } | null = null;
  if (session.autoStackOverlaps) {
    const entry = await prisma().timeEntry.findFirst({
      where: { id, userId: session.userId, deletedAt: null },
      select: { companyId: true, startedAt: true, endedAt: true },
    });
    if (entry?.endedAt) {
      const probe = await previewAutoStack(prisma(), {
        actorUserId: session.userId,
        companyId: entry.companyId,
        candidate: { kind: 'edit', id, startedAt: entry.startedAt, endedAt: entry.endedAt },
        direction: 'forward',
        now: new Date(),
      });
      if (probe.ok) {
        const moved =
          probe.plan.shifts.length > 0 ||
          probe.plan.candidateAfter.startedAt.getTime() !== entry.startedAt.getTime() ||
          probe.plan.candidateAfter.endedAt.getTime() !== entry.endedAt.getTime();
        if (moved) {
          overlap = {
            entryId: id,
            startedAt: entry.startedAt.toISOString(),
            endedAt: entry.endedAt.toISOString(),
          };
        }
      }
    }
  }
  return jsonCors(req, { ok: true, overlap });
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @tt/web vitest run tests/services/v1-timer-stop-route.test.ts && pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/timer/[id]/stop/route.ts apps/web/tests/services/v1-timer-stop-route.test.ts
git commit -m "feat(api): stop route returns overlap probe when auto-stack is on (US-78, US-79, US-80)"
```

---

### Task 6: New REST routes — auto-stack preview + apply

**Files:**
- Create: `apps/web/src/lib/api/auto-stack-route-helpers.ts`
- Create: `apps/web/src/app/api/v1/entries/[id]/auto-stack/preview/route.ts`
- Create: `apps/web/src/app/api/v1/entries/[id]/auto-stack/route.ts`
- Test: `apps/web/tests/services/v1-auto-stack-routes.test.ts` (create)

**Interfaces:**
- Consumes: `resolveApiSession`, CORS helpers, `previewAutoStack`/`saveEntryWithAutoStack`.
- Produces: `POST /api/v1/entries/{id}/auto-stack/preview` and `POST /api/v1/entries/{id}/auto-stack`, body `{ direction: 'forward'|'backward'|'manual', startedAt?: ISO }`, returning `{ ok: true, plan: WirePlan }` or `{ error }`. Cross-company id ⇒ 404 `not_found`.
- `WirePlan` (ISO strings): `{ direction; shifts: { entryId; before:{startedAt,endedAt}; after:{startedAt,endedAt} }[]; candidateAfter:{startedAt,endedAt} }`.

- [ ] **Step 1: Write the failing tests**

`saveEntryWithAutoStack` opens its own `$transaction`, so this suite uses the `resetDb` + real-client pattern (mirroring `auto-stack-save.test.ts`) with mocked `prisma()`/`resolveApiSession`. Create `apps/web/tests/services/v1-auto-stack-routes.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, resetDb, stopTestPrisma } from '@tt/db/test';

const ctx = vi.hoisted(() => ({ db: null as unknown as PrismaClient, userId: '' }));
vi.mock('@/lib/session', () => ({ prisma: () => ctx.db, SESSION_COOKIE: 'tt-session' }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          autoStackOverlaps: true,
          memberships: [],
        }
      : null,
  pickActiveCompany: () => null,
}));
const { POST: previewPOST } = await import(
  '../../src/app/api/v1/entries/[id]/auto-stack/preview/route.js'
);
const { POST: applyPOST } = await import('../../src/app/api/v1/entries/[id]/auto-stack/route.js');

let prisma: PrismaClient;
let companyId: string;
let userId: string;
let otherCompanyId: string;
let otherUserId: string;
const t = (hhmm: string): Date => new Date(`2026-05-16T${hhmm}:00.000Z`);

beforeAll(async () => {
  prisma = await getTestPrisma();
  ctx.db = prisma;
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);
beforeEach(async () => {
  await resetDb(prisma);
  const owner = await prisma.user.create({
    data: { email: 'owner@test', passwordHash: 'x', fullName: 'Owner' },
  });
  userId = owner.id;
  ctx.userId = owner.id;
  const company = await prisma.company.create({ data: { name: 'Co', slug: 'co' } });
  companyId = company.id;
  await prisma.membership.create({ data: { userId, companyId, role: 'admin' } });
  const other = await prisma.user.create({
    data: { email: 'other@test', passwordHash: 'x', fullName: 'Other' },
  });
  otherUserId = other.id;
  const otherCo = await prisma.company.create({ data: { name: 'Other Co', slug: 'other-co' } });
  otherCompanyId = otherCo.id;
  await prisma.membership.create({
    data: { userId: otherUserId, companyId: otherCompanyId, role: 'admin' },
  });
});

async function makeEntry(
  startedAt: Date,
  endedAt: Date | null,
  uid = userId,
  cid = companyId,
): Promise<{ id: string }> {
  return prisma.timeEntry.create({
    data: { userId: uid, companyId: cid, description: '', startedAt, endedAt },
    select: { id: true },
  });
}
function req(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

describe('auto-stack REST routes', () => {
  it('US-81: preview returns a plan for an overlapping forward case', async () => {
    await makeEntry(t('09:00'), t('10:00'));
    const cand = await makeEntry(t('09:30'), t('10:30'));
    const res = await previewPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack/preview`, { direction: 'forward' }),
      params(cand.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; plan: { candidateAfter: unknown } };
    expect(body.ok).toBe(true);
    expect(body.plan.candidateAfter).toBeDefined();
  });

  it('US-82: apply with manual start moves the blocker and persists', async () => {
    const blocker = await makeEntry(t('12:30'), t('13:30'));
    const cand = await makeEntry(t('12:45'), t('14:00'));
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack`, {
        direction: 'manual',
        startedAt: t('13:00').toISOString(),
      }),
      params(cand.id),
    );
    expect(res.status).toBe(200);
    const moved = await prisma.timeEntry.findUniqueOrThrow({ where: { id: blocker.id } });
    expect(moved.startedAt.toISOString()).toBe(t('12:00').toISOString());
  });

  it('US-85: preview on a cross-company entry id returns 404 not_found', async () => {
    const foreign = await makeEntry(t('10:00'), t('11:00'), otherUserId, otherCompanyId);
    const res = await previewPOST(
      req(`http://localhost/api/v1/entries/${foreign.id}/auto-stack/preview`, { direction: 'forward' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('US-85: apply on a cross-company entry id returns 404 not_found', async () => {
    const foreign = await makeEntry(t('10:00'), t('11:00'), otherUserId, otherCompanyId);
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${foreign.id}/auto-stack`, { direction: 'forward' }),
      params(foreign.id),
    );
    expect(res.status).toBe(404);
  });

  it('US-86: apply with manual start ≥ end returns 422 invalid_window', async () => {
    const cand = await makeEntry(t('12:45'), t('14:00'));
    const res = await applyPOST(
      req(`http://localhost/api/v1/entries/${cand.id}/auto-stack`, {
        direction: 'manual',
        startedAt: t('14:00').toISOString(),
      }),
      params(cand.id),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_window');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tt/web vitest run tests/services/v1-auto-stack-routes.test.ts`
Expected: FAIL — route modules do not exist.

- [ ] **Step 3: Create the shared helper, then the two thin routes**

The two routes share identical request parsing + entry resolution + the wire serializer. Extract them into one helper module so neither route duplicates the block. Create `apps/web/src/lib/api/auto-stack-route-helpers.ts`:

```ts
import type { NextRequest } from 'next/server';
import { errorCors } from './cors.js';
import type { ApiSession } from './auth.js';
import { prisma } from '../session.js';
import type { Candidate, Direction, Plan } from '../services/auto-stack.js';

const VALID_DIRECTIONS = ['forward', 'backward', 'manual'] as const;

export interface ParsedAutoStackRequest {
  candidate: Candidate;
  companyId: string;
  direction: Direction;
  manualStartedAt?: Date;
}

export type ParseOutcome =
  | { ok: true; value: ParsedAutoStackRequest }
  | { ok: false; response: Response };

/**
 * Parse + validate an auto-stack request body and resolve the target entry
 * for this user. Returns either the parsed inputs (entry resolved to an
 * `edit` candidate) or a ready CORS error Response. A cross-company or
 * unknown id resolves to a 404 `not_found` (no existence leak).
 */
export async function parseAutoStackRequest(
  req: NextRequest,
  session: ApiSession,
  id: string,
): Promise<ParseOutcome> {
  let body: { direction?: unknown; startedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: errorCors(req, 400, 'invalid_json') };
  }
  if (!VALID_DIRECTIONS.includes(body.direction as (typeof VALID_DIRECTIONS)[number])) {
    return { ok: false, response: errorCors(req, 400, 'invalid_input') };
  }
  const direction = body.direction as Direction;

  const entry = await prisma().timeEntry.findFirst({
    where: { id, userId: session.userId, deletedAt: null },
    select: { companyId: true, startedAt: true, endedAt: true },
  });
  if (!entry || !entry.endedAt) {
    return { ok: false, response: errorCors(req, 404, 'not_found') };
  }

  let manualStartedAt: Date | undefined;
  if (direction === 'manual') {
    if (typeof body.startedAt !== 'string') {
      return { ok: false, response: errorCors(req, 400, 'invalid_input') };
    }
    manualStartedAt = new Date(body.startedAt);
    if (Number.isNaN(manualStartedAt.getTime())) {
      return { ok: false, response: errorCors(req, 400, 'invalid_input') };
    }
  }

  return {
    ok: true,
    value: {
      candidate: { kind: 'edit', id, startedAt: entry.startedAt, endedAt: entry.endedAt },
      companyId: entry.companyId,
      direction,
      manualStartedAt,
    },
  };
}

export function planToWire(plan: Plan): unknown {
  return {
    direction: plan.direction,
    shifts: plan.shifts.map((s) => ({
      entryId: s.entryId,
      before: { startedAt: s.before.startedAt.toISOString(), endedAt: s.before.endedAt.toISOString() },
      after: { startedAt: s.after.startedAt.toISOString(), endedAt: s.after.endedAt.toISOString() },
    })),
    candidateAfter: {
      startedAt: plan.candidateAfter.startedAt.toISOString(),
      endedAt: plan.candidateAfter.endedAt.toISOString(),
    },
  };
}
```

Create `apps/web/src/app/api/v1/entries/[id]/auto-stack/preview/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { previewAutoStack } from '@/lib/services/auto-stack-save';
import { parseAutoStackRequest, planToWire } from '@/lib/api/auto-stack-route-helpers';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const parsed = await parseAutoStackRequest(req, session, id);
  if (!parsed.ok) return parsed.response;
  const { candidate, companyId, direction, manualStartedAt } = parsed.value;

  const result = await previewAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId,
    candidate,
    direction,
    manualStartedAt,
    now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { ok: true, plan: planToWire(result.plan) });
}
```

Create `apps/web/src/app/api/v1/entries/[id]/auto-stack/route.ts` — same shape, calling `saveEntryWithAutoStack`:

```ts
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { saveEntryWithAutoStack } from '@/lib/services/auto-stack-save';
import { parseAutoStackRequest, planToWire } from '@/lib/api/auto-stack-route-helpers';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const parsed = await parseAutoStackRequest(req, session, id);
  if (!parsed.ok) return parsed.response;
  const { candidate, companyId, direction, manualStartedAt } = parsed.value;

  const result = await saveEntryWithAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId,
    candidate,
    direction,
    manualStartedAt,
    now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { ok: true, plan: planToWire(result.plan) });
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @tt/web vitest run tests/services/v1-auto-stack-routes.test.ts && pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/auto-stack-route-helpers.ts apps/web/src/app/api/v1/entries/[id]/auto-stack apps/web/tests/services/v1-auto-stack-routes.test.ts
git commit -m "feat(api): auto-stack preview + apply REST routes (US-81, US-82, US-85, US-86)"
```

---

### Task 7: Extension API client — me field, stop result, preview/apply clients

**Files:**
- Modify: `apps/extension/src/api.ts`

**Interfaces:**
- Produces:
  - `MeResponse.autoStackOverlaps?: boolean`
  - `OverlapInfo = { entryId: string; startedAt: string; endedAt: string }`
  - `StopTimerResult = { overlap: OverlapInfo | null }`
  - `stopTimer(session, entryId): Promise<StopTimerResult>` (was `Promise<void>`)
  - `AutoStackDirection = 'forward' | 'backward' | 'manual'`
  - `WirePlan = { direction; shifts: WireShift[]; candidateAfter: WireRange }`
  - `previewAutoStack(session, entryId, { direction, startedAt? }): Promise<WirePlan>`
  - `applyAutoStack(session, entryId, { direction, startedAt? }): Promise<WirePlan>`

- [ ] **Step 1: Add types and the me field**

In `apps/extension/src/api.ts`, add to `MeResponse` (after line 24):

```ts
  /** When true, stopping a timer that overlaps offers rearrangement. */
  autoStackOverlaps?: boolean;
```

Add near `EntryDto` (after line 58):

```ts
export interface OverlapInfo {
  entryId: string;
  startedAt: string;
  endedAt: string;
}

export type AutoStackDirection = 'forward' | 'backward' | 'manual';

export interface WireRange {
  startedAt: string;
  endedAt: string;
}

export interface WireShift {
  entryId: string;
  before: WireRange;
  after: WireRange;
}

export interface WirePlan {
  direction: AutoStackDirection;
  shifts: WireShift[];
  candidateAfter: WireRange;
}
```

- [ ] **Step 2: Change `stopTimer` to return the overlap**

Replace `stopTimer` (lines 272-279):

```ts
export interface StopTimerResult {
  overlap: OverlapInfo | null;
}

export async function stopTimer(
  session: ApiSession,
  entryId: string,
): Promise<StopTimerResult> {
  const data = await call<{ ok: true; overlap: OverlapInfo | null }>(
    session.apiBase,
    `/api/v1/timer/${encodeURIComponent(entryId)}/stop`,
    { method: 'POST' },
    session.token,
  );
  return { overlap: data.overlap ?? null };
}
```

- [ ] **Step 3: Add preview/apply clients**

Append after `createProject` (after line 356):

```ts
export interface AutoStackBody {
  direction: AutoStackDirection;
  /** ISO; required when direction === 'manual'. */
  startedAt?: string;
}

export async function previewAutoStack(
  session: ApiSession,
  entryId: string,
  body: AutoStackBody,
): Promise<WirePlan> {
  const res = await call<{ ok: true; plan: WirePlan }>(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}/auto-stack/preview`,
    { method: 'POST', body: JSON.stringify(body) },
    session.token,
  );
  return res.plan;
}

export async function applyAutoStack(
  session: ApiSession,
  entryId: string,
  body: AutoStackBody,
): Promise<WirePlan> {
  const res = await call<{ ok: true; plan: WirePlan }>(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}/auto-stack`,
    { method: 'POST', body: JSON.stringify(body) },
    session.token,
  );
  return res.plan;
}
```

- [ ] **Step 4: Typecheck the extension**

Run: `pnpm --filter @tt/extension typecheck`
Expected: FAIL — `sync.ts` `replayMutation`/`executeStop` now mismatch the new `stopTimer` return; this is fixed in Task 9. (If the extension package name differs, use the name from `apps/extension/package.json`.)

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/api.ts
git commit -m "feat(ext): api client for auto-stack preview/apply + stop overlap (US-77, US-80)"
```

---

### Task 8: Extension — persistent pending-overlaps store

**Files:**
- Create: `apps/extension/src/pending-overlaps.ts`
- Test: `apps/extension/src/pending-overlaps.test.ts`

**Interfaces:**
- Consumes: `StorageAdapter`, `OverlapInfo` (from `api.ts`).
- Produces: `class PendingOverlaps` with `list()`, `add(info)`, `remove(entryId)`, `head()`. Dedupes by `entryId`. Backed by `chrome.storage.local` key `tt:pending-overlaps`.

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/src/pending-overlaps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './storage.js';
import { PendingOverlaps } from './pending-overlaps.js';

const info = (id: string) => ({ entryId: id, startedAt: '2026-06-17T10:00:00.000Z', endedAt: '2026-06-17T11:00:00.000Z' });

describe('PendingOverlaps', () => {
  it('US-83: adds, heads, and removes overlaps FIFO', async () => {
    const store = new PendingOverlaps(new InMemoryStorageAdapter());
    await store.add(info('a'));
    await store.add(info('b'));
    expect((await store.head())?.entryId).toBe('a');
    await store.remove('a');
    expect((await store.head())?.entryId).toBe('b');
    await store.remove('b');
    expect(await store.head()).toBeNull();
  });

  it('US-83: dedupes by entryId', async () => {
    const store = new PendingOverlaps(new InMemoryStorageAdapter());
    await store.add(info('a'));
    await store.add(info('a'));
    expect(await store.list()).toHaveLength(1);
  });

  it('US-83: survives a fresh instance over the same storage (browser-kill resume)', async () => {
    const storage = new InMemoryStorageAdapter();
    await new PendingOverlaps(storage).add(info('a'));
    const reborn = new PendingOverlaps(storage);
    expect((await reborn.head())?.entryId).toBe('a');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tt/extension vitest run src/pending-overlaps.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/extension/src/pending-overlaps.ts`:

```ts
/**
 * Persistent list of stop-induced overlaps awaiting user resolution.
 *
 * A stop always commits as a plain stop; if the server reports an overlap
 * (online immediately, or when a queued stop replays after reconnect), the
 * entry id lands here. The popup drains this list and shows the auto-stack
 * sheet for each. Stored in chrome.storage.local so a browser kill between
 * the replay and the popup opening doesn't lose the prompt.
 */
import type { StorageAdapter } from './storage.js';
import type { OverlapInfo } from './api.js';

const STORAGE_KEY = 'tt:pending-overlaps';

export class PendingOverlaps {
  constructor(private storage: StorageAdapter) {}

  async list(): Promise<OverlapInfo[]> {
    return (await this.storage.get<OverlapInfo[]>(STORAGE_KEY)) ?? [];
  }

  async add(info: OverlapInfo): Promise<void> {
    const all = await this.list();
    if (all.some((o) => o.entryId === info.entryId)) return;
    all.push(info);
    await this.storage.set(STORAGE_KEY, all);
  }

  async remove(entryId: string): Promise<void> {
    const all = (await this.list()).filter((o) => o.entryId !== entryId);
    if (all.length === 0) await this.storage.remove(STORAGE_KEY);
    else await this.storage.set(STORAGE_KEY, all);
  }

  async head(): Promise<OverlapInfo | null> {
    return (await this.list())[0] ?? null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tt/extension vitest run src/pending-overlaps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/pending-overlaps.ts apps/extension/src/pending-overlaps.test.ts
git commit -m "feat(ext): persistent pending-overlaps store (US-83)"
```

---

### Task 9: Extension sync — capture overlaps online + on replay, expose `pendingOverlap`

**Files:**
- Modify: `apps/extension/src/sync.ts`

**Interfaces:**
- Consumes: `stopTimer` (now returns `StopTimerResult`), `PendingOverlaps`, `OverlapInfo`.
- Produces: `SyncState` gains `pendingOverlap: OverlapInfo | null` and `resolvePendingOverlap: (entryId: string) => Promise<void>`.

- [ ] **Step 1: Wire the store and state**

In `apps/extension/src/sync.ts`:

Add imports — extend the `./api.js` import (lines 14-27) with `type OverlapInfo`, and add the store import after the queue import (line 28):

```ts
import { PendingOverlaps } from './pending-overlaps.js';
```

Add a module-level store next to `queue` (after line 40):

```ts
const pendingOverlaps = new PendingOverlaps(storage);
```

Extend `SyncState` (after line 62, before the closing brace):

```ts
  /** Head of the pending stop-overlap queue, or null. */
  pendingOverlap: OverlapInfo | null;
  /** Remove a resolved/dismissed overlap and advance to the next. */
  resolvePendingOverlap: (entryId: string) => Promise<void>;
```

- [ ] **Step 2: Add state + refresh helper in the hook**

After `const [conflicts, setConflicts] = useState(0);` (line 85):

```ts
  const [pendingOverlap, setPendingOverlap] = useState<OverlapInfo | null>(null);

  const refreshPendingOverlap = useCallback(async (): Promise<void> => {
    setPendingOverlap(await pendingOverlaps.head());
  }, []);
```

Load it on mount — extend the mount effect (lines 90-92):

```ts
  useEffect(() => {
    void queue.size().then(setPending);
    void refreshPendingOverlap();
  }, [refreshPendingOverlap]);
```

- [ ] **Step 3: Capture overlaps on replay (drain)**

In `drain` (lines 107-127), change the `send` callback to record stop overlaps, then refresh the pending head after the flush. Replace the `drain` body:

```ts
  const drain = useCallback(async (): Promise<void> => {
    if (!session) return;
    const result = await queue.flush(
      async (m) => {
        try {
          const r = await replayMutation(session, m);
          if (m.kind === 'stopTimer' && r && r.overlap) {
            await pendingOverlaps.add(r.overlap);
          }
          return { ok: true as const };
        } catch (err) {
          if (err instanceof ApiError) return { ok: false, reason: 'conflict' };
          return { ok: false, reason: 'transient' };
        }
      },
      {
        onConflict: () => setConflicts((c) => c + 1),
      },
    );
    setPending(await queue.size());
    await refreshPendingOverlap();
    if (result.applied > 0 || result.conflicts > 0) {
      await refreshRef.current();
    }
  }, [session, refreshPendingOverlap]);
```

- [ ] **Step 4: Bespoke `executeStop` that surfaces the overlap**

Replace `executeStop` (lines 218-231):

```ts
  const executeStop = useCallback(
    async (entryId: string): Promise<void> => {
      if (!session) return;
      try {
        const res = await stopTimer(session, entryId);
        nudgeServiceWorker();
        await refreshRef.current();
        if (res.overlap) {
          await pendingOverlaps.add(res.overlap);
          await refreshPendingOverlap();
        }
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'stopTimer',
            payload: { id: entryId },
            clientId: crypto.randomUUID(),
          });
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session, refreshPendingOverlap],
  );
```

- [ ] **Step 5: Add `resolvePendingOverlap` and export the new state**

Add before the `return {` (line 299):

```ts
  const resolvePendingOverlap = useCallback(
    async (entryId: string): Promise<void> => {
      await pendingOverlaps.remove(entryId);
      await refreshPendingOverlap();
    },
    [refreshPendingOverlap],
  );
```

Add to the returned object (inside the `return { ... }`, lines 299-310):

```ts
    pendingOverlap,
    resolvePendingOverlap,
```

- [ ] **Step 6: Update `replayMutation` to return the stop result**

Change the signature and the `stopTimer` case (lines 313-323):

```ts
async function replayMutation(
  session: ApiSession,
  m: Mutation,
): Promise<{ overlap: OverlapInfo | null } | void> {
  switch (m.kind) {
    case 'startTimer': {
      const p = m.payload as { sourceEntryId?: string } & StartTimerInput & { companyId?: string };
      if (p.sourceEntryId) await playAgain(session, p.sourceEntryId);
      else await startTimer(session, (p.companyId as string | null) ?? null, p);
      return;
    }
    case 'stopTimer':
      return await stopTimer(session, (m.payload as { id: string }).id);
    case 'deleteEntry':
      await deleteEntry(session, (m.payload as { id: string }).id);
      return;
```

(Leave the `createManual` and `updateEntry` cases unchanged.)

- [ ] **Step 7: Typecheck the extension**

Run: `pnpm --filter @tt/extension typecheck`
Expected: PASS (Task 7's break is now resolved).

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/sync.ts
git commit -m "feat(ext): surface stop overlaps online and on replay (US-80, US-83)"
```

---

### Task 10: Extension — `AutoStackSheet` component

**Files:**
- Create: `apps/extension/src/AutoStackSheet.tsx`

**Interfaces:**
- Consumes: `ApiSession`, `OverlapInfo`, `WirePlan`, `previewAutoStack`, `applyAutoStack`, `AutoStackDirection` from `api.js`; `toLocalInput`/`fromLocalInput` from `datetime.js`.
- Produces: `AutoStackSheet` React component:
  - `{ session: ApiSession; overlap: OverlapInfo; onResolved: () => void; onDismiss: () => void }`
  - Tabs Vpřed / Zpět / Ručně; manual shows a `datetime-local` input defaulting to the overlap's `startedAt`.
  - Re-previews on tab/time change (debounced 200ms). "Posunout a uložit" applies; "Uložit bez posunu" calls `onDismiss`.

- [ ] **Step 1: Implement the component**

Create `apps/extension/src/AutoStackSheet.tsx`:

```tsx
import { useEffect, useState, type ReactElement } from 'react';
import {
  applyAutoStack,
  previewAutoStack,
  type ApiSession,
  type AutoStackDirection,
  type OverlapInfo,
  type WirePlan,
} from './api.js';
import { fromLocalInput, toLocalInput } from './datetime.js';

const TABS: { dir: AutoStackDirection; label: string }[] = [
  { dir: 'forward', label: 'Vpřed' },
  { dir: 'backward', label: 'Zpět' },
  { dir: 'manual', label: 'Ručně' },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function range(r: { startedAt: string; endedAt: string }): string {
  return `${fmt(r.startedAt)}–${fmt(r.endedAt)}`;
}

export function AutoStackSheet({
  session,
  overlap,
  onResolved,
  onDismiss,
}: {
  session: ApiSession;
  overlap: OverlapInfo;
  onResolved: () => void;
  onDismiss: () => void;
}): ReactElement {
  const [direction, setDirection] = useState<AutoStackDirection>('forward');
  const [manualStartedAt, setManualStartedAt] = useState<string>(overlap.startedAt);
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    const timer = setTimeout(() => {
      void previewAutoStack(session, overlap.entryId, {
        direction,
        startedAt: direction === 'manual' ? manualStartedAt : undefined,
      })
        .then((p) => {
          if (!cancelled) setPlan(p);
        })
        .catch(() => {
          if (!cancelled) setError('Náhled se nepodařilo načíst.');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, overlap.entryId, direction, manualStartedAt]);

  function save(): void {
    setBusy(true);
    void applyAutoStack(session, overlap.entryId, {
      direction,
      startedAt: direction === 'manual' ? manualStartedAt : undefined,
    })
      .then(() => onResolved())
      .catch(() => {
        setError('Uložení se nepodařilo.');
        setBusy(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full rounded-t-xl bg-white p-4 text-sm dark:bg-zinc-900">
        <h2 className="mb-1 font-medium">Tento záznam se překrývá s ostatními.</h2>
        <p className="mb-3 text-zinc-600 dark:text-zinc-400">Posunout záznamy, aby šly za sebou?</p>

        <div role="tablist" className="mb-3 flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.dir}
              type="button"
              role="tab"
              aria-selected={direction === tab.dir}
              className={`rounded px-3 py-2 ${
                direction === tab.dir
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              }`}
              onClick={() => setDirection(tab.dir)}
              disabled={busy}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {direction === 'manual' && (
          <label className="mb-3 block">
            <span className="mb-1 block text-zinc-700 dark:text-zinc-300">Začátek práce</span>
            <input
              type="datetime-local"
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={toLocalInput(manualStartedAt)}
              onChange={(e) => {
                if (!e.target.value) return; // empty input → new Date('') throws; ignore
                setManualStartedAt(fromLocalInput(e.target.value));
              }}
              disabled={busy}
            />
          </label>
        )}

        {plan && (
          <ul className="mb-3 space-y-1">
            <li className="font-medium">
              Tento záznam: {range(overlap)} → {range(plan.candidateAfter)}
            </li>
            {plan.shifts.map((s) => (
              <li key={s.entryId} className="text-zinc-600 dark:text-zinc-400">
                {range(s.before)} → {range(s.after)}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mb-3 text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm underline disabled:opacity-50"
            onClick={onDismiss}
            disabled={busy}
          >
            Uložit bez posunu
          </button>
          <div className="flex gap-2">
            <button type="button" className="rounded px-3 py-2" onClick={onDismiss} disabled={busy}>
              Zrušit
            </button>
            <button
              type="button"
              className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              onClick={save}
              disabled={busy || plan === null}
            >
              Posunout a uložit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tt/extension typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/AutoStackSheet.tsx
git commit -m "feat(ext): AutoStackSheet with forward/backward/manual tabs (US-81, US-82)"
```

---

### Task 11: Wire `AutoStackSheet` into the popup

**Files:**
- Modify: `apps/extension/src/popup.tsx`

**Interfaces:**
- Consumes: `sync.pendingOverlap`, `sync.resolvePendingOverlap` (Task 9), `AutoStackSheet` (Task 10).

- [ ] **Step 1: Import the sheet**

In `apps/extension/src/popup.tsx`, after the `EntrySheet` import (line 29):

```ts
import { AutoStackSheet } from './AutoStackSheet.js';
```

- [ ] **Step 2: Render the sheet from `pendingOverlap`**

In `AppShell`'s returned tree, after the `EntrySheet` block (after line 479) and before the `NewProjectSheet` block:

```tsx
      {sync.pendingOverlap ? (
        <AutoStackSheet
          session={state.session}
          overlap={sync.pendingOverlap}
          onResolved={() => {
            const id = sync.pendingOverlap!.entryId;
            void sync.resolvePendingOverlap(id);
            void onChange();
          }}
          onDismiss={() => void sync.resolvePendingOverlap(sync.pendingOverlap!.entryId)}
        />
      ) : null}
```

- [ ] **Step 3: Typecheck + build the extension**

Run: `pnpm --filter @tt/extension typecheck && pnpm --filter @tt/extension build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (documented, not automated)**

Document in the commit body: load the unpacked extension, enable `autoStackOverlaps` in the web app, start two overlapping timers, stop the second → the AutoStackSheet appears with Vpřed/Zpět/Ručně; Ručně lets you pick a start and shows the blocker moving back.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/popup.tsx
git commit -m "feat(ext): show AutoStackSheet for pending stop overlaps (US-80, US-83)"
```

---

### Task 12: Docs + US coverage

**Files:**
- Modify: `docs/reference/features.md`
- Modify: `docs/architecture/` (the file describing the extension and/or the v1 API surface — find via `rg -l "auto-stack|/api/v1" docs/architecture`)
- Modify: `docs/gotchas.md` (only if a 20+-minute surprise occurred during implementation)

**Interfaces:** none (documentation).

- [ ] **Step 1: Add US-77 … US-86 to features.md**

In `docs/reference/features.md`, update the title range (line 1) to `# Features (US-1 … US-86)` and append after US-76:

```markdown
- **US-77** — `GET /api/v1/me` returns the user's `autoStackOverlaps` setting; the extension reads and stores it. The setting remains read-only in the extension (managed in the web app).
- **US-78** — Stopping a timer in the extension with the setting OFF performs a plain stop; the stop response carries `overlap: null` and no dialog appears.
- **US-79** — With the setting ON and no overlap, the stop response carries `overlap: null` and no dialog appears.
- **US-80** — With the setting ON and an overlap, the stop commits as a plain stop and the response carries the overlap payload; the extension opens the auto-stack sheet for the now-closed entry.
- **US-81** — The extension sheet offers Vpřed / Zpět / Ručně and "Uložit bez posunu"; confirming applies the shifts (preserving each duration) and audits one row per shifted entry plus the candidate update.
- **US-82** — Manual mode: the user pins the work's start time; the earlier overlapping ("blocker") entry moves earlier preserving its duration (cascading into entries before it); the candidate's `endedAt` is unchanged.
- **US-83** — A stop performed offline is queued; on reconnect the replay detects the overlap, records it in `tt:pending-overlaps`, and the popup shows the sheet. Survives a browser kill mid-queue.
- **US-84** — The web `AutoStackPreviewDialog` gains a "Ručně" tab with a start-time input (parity); choosing it applies the same manual planner result.
- **US-85** — A cross-company entry id returns `not_found` (404) on `/api/v1/entries/{id}/auto-stack/preview` and `/api/v1/entries/{id}/auto-stack`. No existence leak.
- **US-86** — A manual start in the future, ≥ the candidate's `endedAt`, or outside the candidate's calendar-day window is rejected (`invalid_window`) with no mutation.
```

- [ ] **Step 2: Update architecture docs**

In the architecture file that documents the v1 API and/or the extension, add the two new routes, the stop-route overlap field, the `/me` field, and the `tt:pending-overlaps` storage key + commit-then-resolve model. Keep it factual (AS-IS) and brief.

- [ ] **Step 3: Run the full gate**

Run: `pnpm test:trace`
Expected: 100% US coverage including US-77 … US-86 (every US has a test whose name embeds the ID).

Run: `pnpm test:all`
Expected: lint + typecheck + unit/integration all PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features.md docs/architecture
git commit -m "docs: record extension auto-stack overlap + manual mode (US-77..US-86)"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Shared `manual` planner → Task 1. Service window/threading → Task 2. Web action+dialog parity → Task 3. `/me` setting → Task 4. Stop overlap probe → Task 5. New REST routes → Task 6. Extension client → Task 7. Pending-overlaps store → Task 8. Sync capture (online + deferred) → Task 9. Sheet UI → Task 10. Popup wiring → Task 11. Docs + trace → Task 12.
- Commit-then-resolve model → Tasks 5/9/11. Offline deferral → Tasks 8/9. Read-only setting → Tasks 4/7 (no toggle added). Cross-company 404 → Tasks 2/6. `auditCount` → Task 2. Manual same-day/window rejection → Tasks 2/6 (US-86).

**Type consistency:** `Direction = 'forward'|'backward'|'manual'` (T1) is used identically in T2/T3/T6/T7/T10 (`AutoStackDirection` mirrors it on the extension side). `manualStartedAt: Date` flows T1→T2; `startedAt: string` (ISO) is the wire form in T3/T6/T7/T10. `OverlapInfo`/`WirePlan` defined in T7 are consumed unchanged in T8/T9/T10. `stopTimer` return changed in T7 and the consumer fixed in T9. `planToWire` defined once (T6) and imported by the apply route.

**Placeholder scan:** No TBD/TODO; every code step shows complete code, including full test files with their own `vi.mock`/`withTx`/`resetDb` setup (no reliance on undefined shared helpers). The route-test harness matches the real repo pattern in `v1-entries-update-route.test.ts` (mock `@/lib/session` + `@/lib/api/auth`) and `auto-stack-save.test.ts` (`resetDb` + real client for the transaction-opening apply route). Task 12 Step 2 is the one intentionally open instruction — "update the architecture file that documents the v1 API/extension" — because the target file is located by `rg` at execution time; that is a doc-location lookup, not missing content.
