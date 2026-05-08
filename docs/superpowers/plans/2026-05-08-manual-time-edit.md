# Manual time edit (US-54) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Edit dialog that lets a user (or admin) correct an entry's start and end times from four list surfaces — Today, Running timers, Timesheet, Reports — using the existing `updateEntry` service unchanged.

**Architecture:** One client `<EditEntryDialog>` (built on the existing `ConfirmModal` primitive) plus a thin `<EditEntryButton>` wrapper. Each list surface drops the button next to existing per-row actions and passes the entry's current `startedAt`/`endedAt`. Save calls the existing `updateEntryAction` server action; service and DB are unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind, `next-intl` (`cs.json`), shadcn-style primitives in `packages/ui`, Vitest + testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-08-manual-time-edit-design.md`

**Surface clarification vs spec:** The spec listed surface #4 as "dashboard per-member drill-down (US-38)". The dashboard's "Lidé a čas" card today shows totals only — it does not link to per-member entries. The actual admin UI that exposes per-member entries with descriptions is **the Reports table** (`/reports`), which already supports a `member` filter and renders a table of entries with `userName`. Surface #4 is therefore the Reports table. Spec intent (admin can edit anyone's entry) is preserved; only the location is clarified.

---

## File Structure

**New files (all under `apps/web`):**

- `src/components/time/EditEntryDialog.tsx` — client. The reusable dialog. Owns inputs, validation, action call, error display.
- `src/components/time/EditEntryButton.tsx` — client. Trigger button + local open state. Renders `<EditEntryDialog>` when open.
- `tests/e2e/time-entry-edit.spec.ts` — Playwright. Three e2e scenarios.

**Modified files:**

- `apps/web/messages/cs.json` — add `timeEntry.edit.*` namespace.
- `apps/web/src/app/(authenticated)/timer/TodayList.tsx` — add ✎ button per row, refetch on save.
- `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx` — add ✎ button per row, refetch on save.
- `apps/web/src/app/(authenticated)/timesheet/page.tsx` — promote each entry row to a small client wrapper that hosts the trigger.
- `apps/web/src/app/(authenticated)/timesheet/TimesheetEntryRow.tsx` — **new** (created in the timesheet task). Client wrapper that owns the row's edit state and re-renders on save.
- `apps/web/src/app/(authenticated)/reports/page.tsx` — replace the `<Td>` actions placeholder with the trigger; data refresh via `router.refresh()` from a small client wrapper.
- `apps/web/src/app/(authenticated)/reports/ReportsRowActions.tsx` — **new**. Client wrapper that hosts the trigger and calls `router.refresh()` on save.
- `apps/web/tests/services/time-entries.test.ts` — add US-54 cases.
- `apps/web/tests/actions/time.test.ts` — add US-54 action error path. (Created in the action task if the file doesn't already exist; verified before writing.)
- `apps/web/tests/playwright.spec.ts` references — none, e2e config picks up new spec file automatically.
- `docs/reference/features.md` — add US-54 line.
- `scripts/test-trace.ts` — bump `TOTAL_US` from 53 to 54.

**Unchanged:**

- `apps/web/src/lib/services/time-entries.ts` — already supports the patch shape we need.
- `apps/web/src/lib/actions/time.ts` — `updateEntryAction` already accepts `startedAt: string` / `endedAt: string | null` and returns Czech error messages.

---

## Task 1: Register US-54 in features and bump the trace cap

**Files:**

- Modify: `docs/reference/features.md`
- Modify: `scripts/test-trace.ts:10`

- [ ] **Step 1: Add the US-54 line to `docs/reference/features.md`**

Open `docs/reference/features.md` and find the line `- **US-53** — Reorder projects within a client …`. Add the following line immediately after it:

```markdown
- **US-54** — User (or admin) opens an Edit dialog from any entry list and corrects the entry's start and end times. Editing a running timer with no end specified keeps it running with the new start; supplying an end stops the timer. Validation rules (`end > start`, `start ≤ now`, `end ≤ now`) match manual-entry rules. Every save produces exactly one audit row.
```

- [ ] **Step 2: Bump `TOTAL_US`**

In `scripts/test-trace.ts:10`, change:

```ts
const TOTAL_US = 53;
```

to:

```ts
const TOTAL_US = 54;
```

- [ ] **Step 3: Run the trace script to confirm it now reports US-54 missing**

Run: `pnpm test:trace`
Expected: exits non-zero with `Missing tests for: US-54`. This is what we want — it proves the gate is now enforcing US-54 and gives us a target for the test tasks below.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features.md scripts/test-trace.ts
git commit -m "feat(reference): register US-54 manual time edit and bump trace cap"
```

---

## Task 2: Add Czech translation keys

**Files:**

- Modify: `apps/web/messages/cs.json`

- [ ] **Step 1: Locate the `timer` block in `cs.json`**

Open `apps/web/messages/cs.json`. Find the `"timer": { … }` object. We will add a new sibling key `"timeEntry"` immediately after `"timer"` (this keeps the dialog's keys grouped under their own namespace and avoids collisions with timer-specific keys).

- [ ] **Step 2: Add the namespace**

After the closing brace of the `"timer"` block (and the comma that follows), add:

```json
"timeEntry": {
  "edit": {
    "title": "Upravit záznam",
    "startedAt": "Začátek",
    "endedAt": "Konec",
    "duration": "Trvání",
    "keepRunning": "Ponechat běžící",
    "save": "Uložit",
    "cancel": "Zrušit",
    "errors": {
      "invalidWindow": "Konec musí být po začátku.",
      "futureTimestamp": "Čas nemůže být v budoucnosti.",
      "notFound": "Záznam nelze upravit",
      "endRequiredForStopped": "U dokončeného záznamu je konec povinný."
    }
  }
},
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `pnpm --filter @tt/web exec node -e "JSON.parse(require('fs').readFileSync('messages/cs.json', 'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/cs.json
git commit -m "feat(i18n): add cs translations for time-entry edit dialog"
```

---

## Task 3: Service-layer tests — US-54 coverage

**Files:**

- Modify: `apps/web/tests/services/time-entries.test.ts`

These tests cover the service contract through the lens of US-54. The service code is unchanged, so each test is expected to **pass on first run** — they are coverage assertions that lock in current behavior under the new user story.

- [ ] **Step 1: Update the file's top-of-file comment**

Open `apps/web/tests/services/time-entries.test.ts`. On line 3 (the `Covers US-…` comment), add `, US-54` to the list:

Before:

```ts
 * Covers US-19, US-20, US-21, US-22, US-23, US-24, US-25, US-26, US-27, US-28.
```

After:

```ts
 * Covers US-19, US-20, US-21, US-22, US-23, US-24, US-25, US-26, US-27, US-28, US-54.
```

- [ ] **Step 2: Add the US-54 test cluster**

Find the existing US-28 test (around line 296). After its closing `});`, add the following block (keep it inside the same `describe('time entries', …)`):

```ts
it('US-54: owner shifts start time on a running timer; entry stays running', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54a');
    const start = await startTimer(tx, w.user, { companyId: w.company });
    if (!start.ok) throw new Error('setup');
    const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
    const newStart = new Date(entry.startedAt.getTime() - 60 * 60 * 1000);
    const upd = await updateEntry(tx, w.user, start.value.id, { startedAt: newStart });
    expect(upd.ok).toBe(true);
    const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
    expect(reread.endedAt).toBeNull();
    expect(reread.startedAt.getTime()).toBe(newStart.getTime());
    expect(await auditCount(tx, start.value.id)).toBe(2); // start + edit
  });
});

it('US-54: owner sets endedAt on a running timer; entry becomes stopped', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54b');
    const start = await startTimer(tx, w.user, { companyId: w.company });
    if (!start.ok) throw new Error('setup');
    const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
    const endedAt = new Date(entry.startedAt.getTime() + 20 * 60 * 1000);
    const upd = await updateEntry(tx, w.user, start.value.id, { endedAt });
    expect(upd.ok).toBe(true);
    const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
    expect(reread.endedAt?.getTime()).toBe(endedAt.getTime());
    expect(await auditCount(tx, start.value.id)).toBe(2);
  });
});

it('US-54: admin corrects another members stopped entry', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54c');
    const now = new Date('2026-05-03T10:00:00Z');
    const m = await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-04-15T08:00:00Z'),
        endedAt: new Date('2026-04-15T09:00:00Z'),
      },
      now,
    );
    if (!m.ok) throw new Error('setup');
    const newEnd = new Date('2026-04-15T08:20:00Z');
    const upd = await updateEntry(tx, w.admin, m.value.id, { endedAt: newEnd });
    expect(upd.ok).toBe(true);
    const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: m.value.id } });
    expect(reread.endedAt?.getTime()).toBe(newEnd.getTime());
    const audits = await tx.auditLog.findMany({
      where: { entityType: 'TimeEntry', entityId: m.value.id, action: 'update' },
    });
    expect(audits[0]?.actorUserId).toBe(w.admin);
  });
});

it('US-54: cross-company actor gets not_found when editing entry', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54d');
    const start = await startTimer(tx, w.user, { companyId: w.company });
    if (!start.ok) throw new Error('setup');
    const upd = await updateEntry(tx, w.outsider, start.value.id, {
      startedAt: new Date(Date.now() - 60_000),
    });
    expect(upd.ok).toBe(false);
    if (!upd.ok) expect(upd.reason).toBe('not_found');
  });
});

it('US-54: rejects future end timestamp', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54e');
    const now = new Date('2026-05-03T10:00:00Z');
    const m = await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-05-03T08:00:00Z'),
        endedAt: new Date('2026-05-03T09:00:00Z'),
      },
      now,
    );
    if (!m.ok) throw new Error('setup');
    const upd = await updateEntry(
      tx,
      w.user,
      m.value.id,
      { endedAt: new Date('2026-05-03T11:00:00Z') },
      now,
    );
    expect(upd.ok).toBe(false);
    if (!upd.ok) expect(upd.reason).toBe('future_timestamp');
  });
});

it('US-54: rejects end <= start', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54f');
    const now = new Date('2026-05-03T10:00:00Z');
    const m = await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-05-03T08:00:00Z'),
        endedAt: new Date('2026-05-03T09:00:00Z'),
      },
      now,
    );
    if (!m.ok) throw new Error('setup');
    const upd = await updateEntry(
      tx,
      w.user,
      m.value.id,
      { endedAt: new Date('2026-05-03T07:30:00Z') },
      now,
    );
    expect(upd.ok).toBe(false);
    if (!upd.ok) expect(upd.reason).toBe('invalid_window');
  });
});

it('US-54: rejects shifting start past existing end', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us54g');
    const now = new Date('2026-05-03T10:00:00Z');
    const m = await createManualEntry(
      tx,
      w.user,
      {
        companyId: w.company,
        startedAt: new Date('2026-05-03T08:00:00Z'),
        endedAt: new Date('2026-05-03T09:00:00Z'),
      },
      now,
    );
    if (!m.ok) throw new Error('setup');
    const upd = await updateEntry(
      tx,
      w.user,
      m.value.id,
      { startedAt: new Date('2026-05-03T09:30:00Z') },
      now,
    );
    expect(upd.ok).toBe(false);
    if (!upd.ok) expect(upd.reason).toBe('invalid_window');
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `pnpm --filter @tt/web test -- time-entries`
Expected: all new US-54 tests pass. (Service code unchanged, so they should pass on first run.)

- [ ] **Step 4: Run the trace script**

Run: `pnpm test:trace`
Expected: `US coverage: 54/54 (100.0%)`. The earlier failure from Task 1 is now resolved.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/services/time-entries.test.ts
git commit -m "test(web): US-54 service coverage for manual time-entry edits"
```

---

## Task 4: Action-layer test — US-54 error mapping

**Files:**

- Test: `apps/web/tests/actions/time.test.ts` (verify whether this file exists; create if absent)
- Reference: `apps/web/src/lib/actions/time.ts:69`

The action `updateEntryAction` already maps service `invalid_window` → Czech `'Konec musí být po začátku'`. We add one test to lock that translation in for US-54.

- [ ] **Step 1: Check whether the actions test file already exists**

Run: `ls apps/web/tests/actions 2>/dev/null && cat apps/web/tests/actions/time.test.ts 2>/dev/null | head -20`

If the directory and file exist, append to the file. If not, create both.

- [ ] **Step 2: Decide based on what Step 1 returned**

**Case A — file exists:** Skip to Step 3.

**Case B — file does not exist:** Create `apps/web/tests/actions/time.test.ts` with this scaffolding (mirroring the service-test structure):

```ts
/**
 * Action-layer tests for time-entry actions.
 * Covers US-54.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma } from '@tt/db/test';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

describe('time actions', () => {
  // tests added below
});
```

Note: `updateEntryAction` requires a session. Action-layer testing in this project may already have a session-mock helper — check `apps/web/tests/` siblings for an existing pattern. **If no session helper exists, drop Task 4 entirely and rely on Task 3 (service) + Task 8 (e2e) for US-54 coverage.** The trace cap requirement is already satisfied by Task 3.

- [ ] **Step 3: Append the action test (if a session helper is available)**

```ts
it('US-54: updateEntryAction returns invalid_window error in Czech', async () => {
  // Use the existing session helper for this project (locate via grep:
  //   grep -rn "withSession\|mockSession" apps/web/tests/actions
  // ).
  // The shape below assumes a `withSession(userId, companyId, fn)` helper that
  // sets up the session cookie context for `requireActiveCompany()` to read.
  // If the helper differs, adapt the call signature. If no such helper exists,
  // SKIP this task (see Step 2 Case B).
  //
  // Test body — pseudocode:
  //   1. Create a company + user + manual entry with a known window.
  //   2. Inside withSession, call updateEntryAction(entryId, { endedAt: <past-the-start> }).
  //   3. Assert result is { ok: false, error: 'Konec musí být po začátku' }.
});
```

If the helper exists, replace the pseudocode with a real call once the helper's shape is confirmed during execution. The test should be a thin wrapper over the action and assert the **Czech error string** specifically — that is the value-add over the service tests.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @tt/web test -- actions/time`
Expected: pass.

- [ ] **Step 5: Commit (only if a real test was added)**

```bash
git add apps/web/tests/actions/time.test.ts
git commit -m "test(web): US-54 action returns Czech error for invalid window"
```

---

## Task 5: Build `<EditEntryDialog>` (client component)

**Files:**

- Create: `apps/web/src/components/time/EditEntryDialog.tsx`

This is the reusable dialog. It uses the existing `ConfirmModal` from `@tt/ui` as its shell (modal handles esc/click-outside/body scroll lock + Cancel/Save buttons), and renders the form fields as `children`.

- [ ] **Step 1: Create the component file with full content**

Create `apps/web/src/components/time/EditEntryDialog.tsx`:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal, Field, Input } from '@tt/ui';
import { updateEntryAction } from '@/lib/actions/time';

export interface EditEntryDialogProps {
  entryId: string;
  initial: { startedAt: string; endedAt: string | null };
  open: boolean;
  onClose(): void;
  onSaved(updated: { startedAt: string; endedAt: string | null }): void;
}

function isoToLocalInput(iso: string): string {
  // datetime-local expects YYYY-MM-DDTHH:mm in *local* time, no timezone.
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // local is YYYY-MM-DDTHH:mm in local time; new Date(local) parses it as local.
  return new Date(local).toISOString();
}

function fmtDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

export function EditEntryDialog({
  entryId,
  initial,
  open,
  onClose,
  onSaved,
}: EditEntryDialogProps): ReactElement {
  const t = useTranslations('timeEntry.edit');
  const [start, setStart] = useState<string>(() => isoToLocalInput(initial.startedAt));
  const [end, setEnd] = useState<string>(() =>
    initial.endedAt ? isoToLocalInput(initial.endedAt) : '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasRunning = initial.endedAt === null;
  const duration = useMemo(
    () => (end ? fmtDuration(localInputToIso(start), localInputToIso(end)) : ''),
    [start, end],
  );

  async function handleSave(): Promise<void> {
    setError(null);
    if (!wasRunning && !end) {
      setError(t('errors.endRequiredForStopped'));
      return;
    }
    setPending(true);
    try {
      const startIso = localInputToIso(start);
      const endIso: string | null = end ? localInputToIso(end) : null;
      const patch: { startedAt: string; endedAt?: string | null } = { startedAt: startIso };
      // Only include endedAt when the user filled it in (running timers stay running).
      if (end) patch.endedAt = endIso;
      const r = await updateEntryAction(entryId, patch);
      if (r.ok) {
        onSaved({ startedAt: startIso, endedAt: end ? endIso : null });
        onClose();
        return;
      }
      // updateEntryAction already returns Czech strings for invalid_window/future_timestamp/not_found.
      setError(r.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmModal
      open={open}
      title={t('title')}
      confirmLabel={t('save')}
      cancelLabel={t('cancel')}
      loading={pending}
      onConfirm={() => void handleSave()}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <Field label={t('startedAt')} htmlFor="edit-entry-start">
          <Input
            id="edit-entry-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </Field>
        <Field
          label={t('endedAt')}
          htmlFor="edit-entry-end"
          hint={wasRunning && !end ? t('keepRunning') : undefined}
        >
          <Input
            id="edit-entry-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            // Browser-required only for stopped entries; we re-check in handleSave.
            required={!wasRunning}
          />
        </Field>
        {duration ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('duration')}: <span className="font-mono font-semibold">{duration}</span>
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </ConfirmModal>
  );
}
```

- [ ] **Step 2: Type-check the new file**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass with no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/time/EditEntryDialog.tsx
git commit -m "feat(web): EditEntryDialog client component"
```

---

## Task 6: Build `<EditEntryButton>` wrapper

**Files:**

- Create: `apps/web/src/components/time/EditEntryButton.tsx`

- [ ] **Step 1: Create the file with full content**

```tsx
'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '@tt/ui';
import { EditEntryDialog } from './EditEntryDialog';

export interface EditEntryButtonProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  onSaved?(updated: { startedAt: string; endedAt: string | null }): void;
  className?: string;
}

export function EditEntryButton({
  entryId,
  startedAt,
  endedAt,
  onSaved,
  className,
}: EditEntryButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Upravit"
        className={className}
      >
        ✎
      </Button>
      {open ? (
        <EditEntryDialog
          entryId={entryId}
          initial={{ startedAt, endedAt }}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={(u) => {
            onSaved?.(u);
          }}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/time/EditEntryButton.tsx
git commit -m "feat(web): EditEntryButton trigger wrapper"
```

---

## Task 7: Wire into `TodayList`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TodayList.tsx`

- [ ] **Step 1: Add the import**

At the top of `TodayList.tsx` (after the existing `import { Button … }` line), add:

```ts
import { EditEntryButton } from '@/components/time/EditEntryButton';
import { notifyTimerChanged } from '@/lib/timer-events';
```

(`notifyTimerChanged` may already be imported — check before adding the second line. If it's already imported, add only the first.)

- [ ] **Step 2: Add the ✎ button to each row**

In the `Row` component's JSX, the right-side action cluster currently has Play and Delete buttons. Insert `<EditEntryButton …>` immediately before the Play button. Replace this block:

```tsx
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
```

with:

```tsx
        <EditEntryButton
          entryId={entry.id}
          startedAt={entry.startedAt}
          endedAt={entry.endedAt}
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
```

The `notifyTimerChanged()` call triggers `TimerLists`' refetch effect (`apps/web/src/app/(authenticated)/timer/TimerLists.tsx:77`), so the row's start/end/duration will refresh from the server after a save.

- [ ] **Step 3: Type-check and run dev server briefly**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass.

Then start the dev server: `pnpm --filter @tt/web dev`. Open http://localhost:3000/timer in a browser, log in, ensure today's list shows the new ✎ button, click it, confirm the dialog opens with the entry's start and end pre-filled, change end by one minute, click _Uložit_, confirm the row's duration updates and the dialog closes. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(authenticated)/timer/TodayList.tsx
git commit -m "feat(timer): edit button on today entries"
```

---

## Task 8: Wire into `RunningTimers`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`

- [ ] **Step 1: Add the import**

At the top of the file, after the existing `notifyTimerChanged` import:

```ts
import { EditEntryButton } from '@/components/time/EditEntryButton';
```

- [ ] **Step 2: Insert ✎ before the Stop button**

In `RunningRow`, the right-side cluster currently has the elapsed timer span and a Stop button. Insert `<EditEntryButton …>` between the elapsed span and the Stop button:

Replace:

```tsx
<div className="flex shrink-0 items-center gap-3">
  <span
    suppressHydrationWarning
    className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
  >
    {formatDurationHMS(elapsed)}
  </span>
  <Button variant="danger" size="sm" loading={pending} onClick={() => void handleStop()}>
    ■ Stop
  </Button>
</div>
```

with:

```tsx
<div className="flex shrink-0 items-center gap-3">
  <span
    suppressHydrationWarning
    className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
  >
    {formatDurationHMS(elapsed)}
  </span>
  <EditEntryButton
    entryId={entry.id}
    startedAt={entry.startedAt}
    endedAt={null}
    onSaved={() => notifyTimerChanged()}
  />
  <Button variant="danger" size="sm" loading={pending} onClick={() => void handleStop()}>
    ■ Stop
  </Button>
</div>
```

Note `endedAt={null}` — running entries have no end. The dialog will treat it as "running" and leave the end input empty with the _Ponechat běžící_ hint.

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass.

- [ ] **Step 4: Manual smoke test**

Start `pnpm --filter @tt/web dev`. Open `/timer`, start a new timer. The Running card should now show ✎ next to Stop. Open the dialog, leave end empty, change start to 30 minutes earlier, save. Confirm the running elapsed jumps by ~30 minutes and the timer stays running. Then open the dialog again, fill in an end value, save. Confirm the entry disappears from the Running list and appears in Today.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(authenticated)/timer/RunningTimers.tsx
git commit -m "feat(timer): edit button on running timers"
```

---

## Task 9: Wire into the Timesheet (weekly view)

**Files:**

- Create: `apps/web/src/app/(authenticated)/timesheet/TimesheetEntryRow.tsx`
- Modify: `apps/web/src/app/(authenticated)/timesheet/page.tsx`

The timesheet page is a **server component**. To host an edit trigger we extract each entry row into a small client wrapper, and call `router.refresh()` in the `onSaved` handler so the server component re-runs and the row reflects the new times.

- [ ] **Step 1: Create `TimesheetEntryRow.tsx`**

```tsx
'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { EditEntryButton } from '@/components/time/EditEntryButton';

export interface TimesheetEntryRowProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  tags: { name: string; color: string }[];
}

export function TimesheetEntryRow({
  entryId,
  startedAt,
  endedAt,
  description,
  clientName,
  projectName,
  startLabel,
  endLabel,
  durationLabel,
  tags,
}: TimesheetEntryRowProps): ReactElement {
  const router = useRouter();
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {description || <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {clientName ? <span>{clientName}</span> : null}
          {projectName ? <span>· {projectName}</span> : null}
          {tags.map((t, i) => (
            <span
              key={i}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-mono tabular-nums">
          {startLabel}–{endLabel}
        </span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {durationLabel}
        </span>
        <EditEntryButton
          entryId={entryId}
          startedAt={startedAt}
          endedAt={endedAt}
          onSaved={() => router.refresh()}
        />
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Update `timesheet/page.tsx` to render through the new wrapper**

Open `apps/web/src/app/(authenticated)/timesheet/page.tsx` and find the section where day-row entries are rendered as inline `<li>` blocks. Replace each per-entry inline `<li>…</li>` with:

```tsx
<TimesheetEntryRow
  key={e.id}
  entryId={e.id}
  startedAt={e.startedAt.toISOString()}
  endedAt={e.endedAt ? e.endedAt.toISOString() : null}
  description={e.description ?? ''}
  clientName={e.client?.name ?? null}
  projectName={e.project?.name ?? null}
  startLabel={fmtTime(e.startedAt)}
  endLabel={e.endedAt ? fmtTime(e.endedAt) : '…'}
  durationLabel={e.endedAt ? fmtDur(e.endedAt.getTime() - e.startedAt.getTime()) : '—'}
  tags={e.tags.map((t) => ({ name: t.tag.name, color: t.tag.color }))}
/>
```

Add the import at the top:

```ts
import { TimesheetEntryRow } from './TimesheetEntryRow';
```

If you cannot find an exact match for the inline `<li>` block (the page may have been refactored since this plan was written), open the file, identify the block that renders one entry per day, and adapt: the goal is to replace the inline JSX with `<TimesheetEntryRow … />`, passing the same data the inline block was rendering.

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass.

- [ ] **Step 4: Manual smoke test**

`pnpm --filter @tt/web dev`. Open `/timesheet`. Each entry row should show ✎. Click ✎ on a past entry, change end, save. Confirm the row updates (server re-render via `router.refresh()` should be near-instant).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(authenticated)/timesheet/TimesheetEntryRow.tsx apps/web/src/app/(authenticated)/timesheet/page.tsx
git commit -m "feat(timesheet): edit button on weekly entries"
```

---

## Task 10: Wire into the Reports table (admin surface)

**Files:**

- Create: `apps/web/src/app/(authenticated)/reports/ReportsRowActions.tsx`
- Modify: `apps/web/src/app/(authenticated)/reports/page.tsx`

The Reports table is a server component listing all entries (admins see all members). We add an extra `<Th>Akce</Th>` column and render the trigger via a client wrapper. The wrapper uses `router.refresh()` to reload the server data after a save.

- [ ] **Step 1: Create the row-actions wrapper**

```tsx
'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { EditEntryButton } from '@/components/time/EditEntryButton';

export interface ReportsRowActionsProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
}

export function ReportsRowActions({
  entryId,
  startedAt,
  endedAt,
}: ReportsRowActionsProps): ReactElement {
  const router = useRouter();
  return (
    <EditEntryButton
      entryId={entryId}
      startedAt={startedAt}
      endedAt={endedAt}
      onSaved={() => router.refresh()}
    />
  );
}
```

- [ ] **Step 2: Update `reports/page.tsx`**

Add the import:

```ts
import { ReportsRowActions } from './ReportsRowActions';
```

In the table header, add a new column heading after the last `<Th className="text-right">Čas</Th>`:

```tsx
<Th>Akce</Th>
```

In the row template (the `<Tr key={r.id}>` block), add a new `<Td>` after the existing time cell. The `ReportRow` type (verified at `apps/web/src/lib/services/reports.ts:23-32`) exposes `id: string`, `startedAt: Date`, and `endedAt: Date | null`, so no service change is needed.

Add this `<Td>`:

```tsx
<Td>
  <ReportsRowActions
    entryId={r.id}
    startedAt={r.startedAt.toISOString()}
    endedAt={r.endedAt ? r.endedAt.toISOString() : null}
  />
</Td>
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @tt/web typecheck`
Expected: pass. If `r.endedAt` typecheck fails, complete the small `runReport` extension referenced above and re-run.

- [ ] **Step 4: Manual smoke test**

`pnpm --filter @tt/web dev`. Open `/reports`. The table should now have an Akce column with ✎ on every row. As an admin, click ✎ on another member's entry, edit end, save. Confirm the row updates after `router.refresh()`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(authenticated)/reports/ReportsRowActions.tsx apps/web/src/app/(authenticated)/reports/page.tsx
git commit -m "feat(reports): edit button on report rows for admin corrections"
```

---

## Task 11: Playwright e2e tests

**Files:**

- Create: `apps/web/tests/e2e/time-entry-edit.spec.ts`

These three e2e tests cover the golden path and both running-timer outcomes, all under US-54. Existing e2e config (`apps/web/playwright.config.ts` + `tests/e2e/global-setup.ts`) seeds an admin and runs against a dev server — we follow the same pattern as `clients-search-reorder.spec.ts`.

- [ ] **Step 1: Create the spec file**

```ts
import { test, expect } from '@playwright/test';

test.describe('US-54: edit time entry', () => {
  test("US-54: user opens Edit on today's entry, changes end, sees updated duration", async ({
    page,
  }) => {
    await page.goto('/timer');

    // Start a timer with a description so we can find the row deterministically.
    const description = `e2e edit ${Date.now()}`;
    await page.getByLabel('Popis činnosti').fill(description);
    await page.getByRole('button', { name: 'Spustit' }).click();

    // Stop it immediately so it lands in Today.
    await page.getByRole('button', { name: '■ Stop' }).first().click();
    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    // Open the edit dialog from this row.
    await row.getByRole('button', { name: 'Upravit' }).click();
    await expect(page.getByText('Upravit záznam')).toBeVisible();

    // Bump the end time forward by 1 hour.
    const endInput = page.locator('#edit-entry-end');
    const current = await endInput.inputValue();
    const d = new Date(current);
    d.setHours(d.getHours() + 1);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const next = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await endInput.fill(next);

    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByText('Upravit záznam')).toBeHidden();

    // Duration cell on the row should now read at least "1h".
    await expect(row).toContainText(/\b\d+h\b/);
  });

  test('US-54: user opens Edit on a running timer, fills end, timer disappears from running list', async ({
    page,
  }) => {
    await page.goto('/timer');
    const description = `e2e running-stop ${Date.now()}`;
    await page.getByLabel('Popis činnosti').fill(description);
    await page.getByRole('button', { name: 'Spustit' }).click();

    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) });
    await expect(runningRow).toBeVisible();

    await runningRow.getByRole('button', { name: 'Upravit' }).click();

    // Fill end with a value 20 minutes after start (use the start input value as the anchor).
    const startInput = page.locator('#edit-entry-start');
    const startValue = await startInput.inputValue();
    const s = new Date(startValue);
    s.setMinutes(s.getMinutes() + 20);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const endValue = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    await page.locator('#edit-entry-end').fill(endValue);

    await page.getByRole('button', { name: 'Uložit' }).click();

    // The running row for this description should be gone (entry has been stopped).
    await expect(
      page
        .locator('div')
        .filter({ hasText: description })
        .filter({ has: page.getByRole('button', { name: '■ Stop' }) }),
    ).toHaveCount(0);

    // It should now appear in Today.
    const todayRow = page.locator('li').filter({ hasText: description });
    await expect(todayRow).toBeVisible();
  });

  test('US-54: user opens Edit on a running timer, only shifts start, timer keeps running', async ({
    page,
  }) => {
    await page.goto('/timer');
    const description = `e2e running-shift ${Date.now()}`;
    await page.getByLabel('Popis činnosti').fill(description);
    await page.getByRole('button', { name: 'Spustit' }).click();

    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) });
    await expect(runningRow).toBeVisible();

    await runningRow.getByRole('button', { name: 'Upravit' }).click();

    // Move start back by 30 minutes; leave end empty.
    const startInput = page.locator('#edit-entry-start');
    const startValue = await startInput.inputValue();
    const s = new Date(startValue);
    s.setMinutes(s.getMinutes() - 30);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const newStart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    await startInput.fill(newStart);

    await page.getByRole('button', { name: 'Uložit' }).click();

    // Still running.
    await expect(
      page
        .locator('div')
        .filter({ hasText: description })
        .filter({ has: page.getByRole('button', { name: '■ Stop' }) }),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter @tt/web test:e2e -- time-entry-edit`
Expected: all three tests pass. If a selector misses (e.g. a label text drift), adjust the selector — do not weaken assertions.

- [ ] **Step 3: Run the trace script one more time**

Run: `pnpm test:trace`
Expected: `US coverage: 54/54 (100.0%)`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/time-entry-edit.spec.ts
git commit -m "test(web): playwright e2e for US-54 manual time-entry edit"
```

---

## Task 12: Final quality gate

**Files:** none

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm test:all`
Expected: lint, typecheck, vitest suites, and trace all pass.

- [ ] **Step 2: If anything fails**

Read the failure carefully. Common likely failures:

- **Lint**: a stray unused import in one of the modified files. Remove it.
- **Typecheck**: missing `endedAt` on the report row shape (Task 10 step 2). Add it.
- **Trace**: US-54 not detected. Confirm at least one test name in `apps/web/tests/services/time-entries.test.ts` contains the literal string `US-54`.

Fix and re-run `pnpm test:all` until it's green.

- [ ] **Step 3: Final summary**

The branch now contains: i18n keys, `EditEntryDialog` + `EditEntryButton`, four wired surfaces (Today, Running, Timesheet, Reports), service tests, optional action test, e2e tests, US-54 registered in features, trace cap bumped to 54.

No DB migration. No service-layer change. No new dependencies.

---

## Self-review notes

Spec coverage:

- Surfaces 1-4 → Tasks 7, 8, 9, 10. ✓
- `EditEntryDialog` + `EditEntryButton` → Tasks 5 + 6. ✓
- Server contract (no service change, action returns Czech) → confirmed in Task 4 + dialog wiring. ✓
- Permissions (owner-or-admin via service `not_found`) → Task 3 cross-company test + Task 3 admin test. ✓
- Realtime (`notifyTimerChanged()`, `router.refresh()`) → Tasks 7, 8, 9, 10. ✓
- i18n keys → Task 2. ✓
- Tests: service (7 cases), action (1 case, optional), e2e (3 scenarios) → Tasks 3, 4, 11. ✓
- Trace gate: cap bump 53→54, US-54 in features → Task 1. ✓

Type/name consistency:

- `EditEntryDialog` props shape (`{ entryId, initial: { startedAt, endedAt }, open, onClose, onSaved }`) is consistent across Tasks 5, 6, 7, 8, 9, 10. ✓
- `updateEntryAction` patch shape matches what's at `apps/web/src/lib/actions/time.ts:69-94`. ✓
- The dialog deliberately omits `endedAt` from the patch when the user leaves it empty — matches the service rule that `undefined` keeps current and `null` un-stops, and we never want to un-stop. ✓
