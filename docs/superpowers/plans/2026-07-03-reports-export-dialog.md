# Reports Export Dialog (US-89) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reports page's three export buttons with one **"Export"** dialog where the user picks the **period**, the **person(s)** (or "Všichni členové"), and the **format** (PDF/CSV), so exports are scoped to a selection instead of dumping every member together.

**Architecture:** The dialog is a thin client component (`ExportDialog`) that manages form state and builds a download URL for the **existing, unchanged** `GET /api/reports/export.pdf` / `export.csv` routes (which already scope by member + role via `runReport`). All non-trivial logic lives in two **pure, node-testable** modules (`export-url.ts`, `date-presets.ts`); the React component is untested wiring, matching a repo that has no component-test harness.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript (strict, `noUncheckedIndexedAccess`), `next-intl` (cs.json), Tailwind, shadcn-style `@tt/ui` primitives, Vitest (node env) + testcontainers (real Postgres) for route tests.

## Global Constraints

- **TypeScript strict + `noUncheckedIndexedAccess`** — index access is `T | undefined`; guard before use.
- **Czech UI via `next-intl`** — no hardcoded strings in JSX; every dialog label is a `cs.json` key.
- **ESM imports use `.js` extensions** (e.g. `from './export-url.js'`), including in tests.
- **Tests use real Postgres via testcontainers — no DB mocks, ever.** Node vitest env; no `@testing-library`.
- **One user-story per `it` block**, US ID embedded verbatim: `it('US-89: …')`.
- **Cross-company reads return 404, not 403** (no existence leak) — mandatory for every read endpoint.
- **Export is read-only → produces no audit rows** (do not assert `auditCount` changes).
- **No `.only`/`.skip`/`xit`/`xdescribe`; no `console.log` in `apps/` or `packages/`** (pre-commit blocks).
- **`pnpm test:trace` must stay at 100%** — US-89 must be referenced by ≥1 test AND `TOTAL_US` bumped to 89.
- **Commits:** This plan runs inside the `/plane-task` session; the per-task `git commit` steps are **batched into the single commit made by `/plane-task finish`** (secure-commit). Implement each task's code + tests but defer committing to finish. (If running standalone, commit per task as written.)

## File Structure

| File                                                             | Responsibility                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(authenticated)/reports/date-presets.ts`       | **New.** Pure date-preset math: `PresetKey`, `PRESETS`, `preset(kind, now)`, `ymdLocal`. Extracted from `ReportFiltersForm` and made deterministic via an injected `now`. |
| `apps/web/src/app/(authenticated)/reports/export-url.ts`         | **New.** Pure logic: `resolveExportGroupBy(allMembers, count)` and `buildExportUrl(input)`. No React import.                                                              |
| `apps/web/src/app/(authenticated)/reports/ExportDialog.tsx`      | **New.** Client component: dialog UI + state, calls the two pure modules, triggers the download.                                                                          |
| `apps/web/src/components/MultiSelect.tsx`                        | **Modify.** Add optional `onChange?: (ids: string[]) => void` (backward-compatible).                                                                                      |
| `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx` | **Modify.** Import presets from `date-presets`; drop the local copies.                                                                                                    |
| `apps/web/src/app/(authenticated)/reports/page.tsx`              | **Modify.** Replace the 3 header `<a>` buttons + `exportQS` block with `<ExportDialog>`.                                                                                  |
| `apps/web/messages/cs.json`                                      | **Modify.** Replace the `reports.export` subtree with the dialog strings.                                                                                                 |
| `apps/web/tests/services/date-presets.test.ts`                   | **New.** Unit test (US-89).                                                                                                                                               |
| `apps/web/tests/services/export-url.test.ts`                     | **New.** Unit test (US-89).                                                                                                                                               |
| `apps/web/tests/services/reports-export-pdf-route.test.ts`       | **Modify.** Add US-89 member-scoped + cross-company-404 cases.                                                                                                            |
| `apps/web/tests/services/reports-export-csv-route.test.ts`       | **New.** US-89 scoping (readable CSV body) + cross-company 404 (also closes a pre-existing gap).                                                                          |
| `scripts/test-trace.ts`                                          | **Modify.** `TOTAL_US = 88 → 89`.                                                                                                                                         |
| `docs/reference/features.md`, `docs/reference/acceptance.md`     | **Modify.** Record US-89.                                                                                                                                                 |

---

### Task 1: Shared, testable date presets

**Files:**

- Create: `apps/web/src/app/(authenticated)/reports/date-presets.ts`
- Test: `apps/web/tests/services/date-presets.test.ts`
- Modify: `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx` (lines 28–70 define local `ymdLocal`/`PresetKey`/`preset`/`PRESETS`; line ~112–119 `activePreset`; line ~143–146 preset onClick)

**Interfaces:**

- Produces: `type PresetKey = 'today'|'yesterday'|'thisWeek'|'lastWeek'|'thisMonth'|'lastMonth'`; `const PRESETS: {key: PresetKey; label: string}[]`; `preset(kind: PresetKey, now: Date): {from: string; to: string}` (both `YYYY-MM-DD`, local); `ymdLocal(d: Date): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/date-presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { preset } from '../../src/app/(authenticated)/reports/date-presets.js';

describe('date presets', () => {
  it('US-89: lastMonth returns the previous full calendar month', () => {
    // Mid-month, local time — no month-boundary ambiguity across time zones.
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('lastMonth', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('US-89: thisMonth spans the first to the last day of the current month', () => {
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('thisMonth', now)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tt/web exec vitest run tests/services/date-presets.test.ts`
Expected: FAIL — cannot resolve `date-presets.js` (module not created yet).

- [ ] **Step 3: Create the module**

Create `apps/web/src/app/(authenticated)/reports/date-presets.ts`:

```ts
export type PresetKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Dnes' },
  { key: 'yesterday', label: 'Včera' },
  { key: 'thisWeek', label: 'Tento týden' },
  { key: 'lastWeek', label: 'Minulý týden' },
  { key: 'thisMonth', label: 'Tento měsíc' },
  { key: 'lastMonth', label: 'Minulý měsíc' },
];

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function preset(kind: PresetKey, now: Date): { from: string; to: string } {
  const start = new Date(now);
  const end = new Date(now);
  switch (kind) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'thisWeek': {
      const dow = (start.getDay() + 6) % 7; // Mon=0..Sun=6
      start.setDate(start.getDate() - dow);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'lastWeek': {
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow - 7);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'thisMonth':
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end.setMonth(start.getMonth() + 1, 0);
      break;
  }
  return { from: ymdLocal(start), to: ymdLocal(end) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tt/web exec vitest run tests/services/date-presets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `ReportFiltersForm` to use the shared module**

In `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx`:

1. Add to the imports near the top: `import { PRESETS, preset, type PresetKey } from './date-presets';`
2. **Delete** the local `ymdLocal` function, the local `type PresetKey`, the local `preset` function, and the local `PRESETS` const (the block spanning roughly lines 28–81 — keep `GROUP_KEYS`).
3. Update the two call sites to pass `new Date()`:
   - In `activePreset`: `const r = preset(key, new Date());`
   - In the preset button `onClick`: `const r = preset(p.key, new Date());`

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web exec vitest run tests/services/date-presets.test.ts`
Expected: typecheck clean; tests PASS.

- [ ] **Step 7: Commit** _(deferred to `/plane-task finish` in this session)_

```bash
git add apps/web/src/app/'(authenticated)'/reports/date-presets.ts \
        apps/web/src/app/'(authenticated)'/reports/ReportFiltersForm.tsx \
        apps/web/tests/services/date-presets.test.ts
git commit -m "refactor(reports): extract testable date presets (US-89)"
```

---

### Task 2: Export URL + grouping resolver (pure logic)

**Files:**

- Create: `apps/web/src/app/(authenticated)/reports/export-url.ts`
- Test: `apps/web/tests/services/export-url.test.ts`

**Interfaces:**

- Consumes: `type GroupBy = 'project'|'member'|'day'` from `@/lib/services/reports`.
- Produces:
  - `resolveExportGroupBy(allMembers: boolean, memberCount: number): GroupBy`
  - `interface ExportUrlInput { format: 'pdf'|'csv'; from: string; to: string; allMembers: boolean; memberIds: string[]; groupBy: GroupBy }`
  - `buildExportUrl(input: ExportUrlInput): string`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/export-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildExportUrl,
  resolveExportGroupBy,
} from '../../src/app/(authenticated)/reports/export-url.js';

function query(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('buildExportUrl', () => {
  it('US-89: scopes to selected members and targets the PDF route', () => {
    const url = buildExportUrl({
      format: 'pdf',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: false,
      memberIds: ['u1', 'u2'],
      groupBy: 'member',
    });
    expect(url.split('?')[0]).toBe('/api/reports/export.pdf');
    const q = query(url);
    expect(q.getAll('member')).toEqual(['u1', 'u2']);
    expect(q.get('from')).toBe('2026-06-01');
    expect(q.get('to')).toBe('2026-06-30');
    expect(q.get('groupBy')).toBe('member');
  });

  it('US-89: omits the member param entirely when exporting all members', () => {
    const url = buildExportUrl({
      format: 'pdf',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: true,
      memberIds: ['u1'],
      groupBy: 'member',
    });
    expect(query(url).has('member')).toBe(false);
  });

  it('US-89: targets the CSV route when the format is csv', () => {
    const url = buildExportUrl({
      format: 'csv',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: false,
      memberIds: ['u1'],
      groupBy: 'project',
    });
    expect(url.split('?')[0]).toBe('/api/reports/export.csv');
  });
});

describe('resolveExportGroupBy', () => {
  it('US-89: groups by member for all-members or multi-select, else by project', () => {
    expect(resolveExportGroupBy(true, 0)).toBe('member');
    expect(resolveExportGroupBy(false, 2)).toBe('member');
    expect(resolveExportGroupBy(false, 1)).toBe('project');
    expect(resolveExportGroupBy(false, 0)).toBe('project');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tt/web exec vitest run tests/services/export-url.test.ts`
Expected: FAIL — cannot resolve `export-url.js`.

- [ ] **Step 3: Create the module**

Create `apps/web/src/app/(authenticated)/reports/export-url.ts`:

```ts
import type { GroupBy } from '@/lib/services/reports';

export interface ExportUrlInput {
  format: 'pdf' | 'csv';
  from: string; // YYYY-MM-DD ('' allowed → param omitted)
  to: string; // YYYY-MM-DD ('' allowed → param omitted)
  allMembers: boolean;
  memberIds: string[]; // used only when allMembers is false
  groupBy: GroupBy;
}

/**
 * Smart default for the export grouping: when several people (or everyone) are
 * exported into one PDF, group by member so each person gets their own section
 * and subtotal; otherwise group by project.
 */
export function resolveExportGroupBy(allMembers: boolean, memberCount: number): GroupBy {
  return allMembers || memberCount > 1 ? 'member' : 'project';
}

/**
 * Builds the download URL for the existing report export routes. `member` is
 * omitted entirely when exporting all members, which makes the route include
 * every member (admin) or fall back to the caller's own entries (non-admin).
 */
export function buildExportUrl(input: ExportUrlInput): string {
  const qs = new URLSearchParams();
  if (input.from) qs.append('from', input.from);
  if (input.to) qs.append('to', input.to);
  if (!input.allMembers) {
    for (const id of input.memberIds) qs.append('member', id);
  }
  qs.append('groupBy', input.groupBy);
  return `/api/reports/export.${input.format}?${qs.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tt/web exec vitest run tests/services/export-url.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** _(deferred to `/plane-task finish`)_

```bash
git add apps/web/src/app/'(authenticated)'/reports/export-url.ts \
        apps/web/tests/services/export-url.test.ts
git commit -m "feat(reports): pure export-url + grouping resolver (US-89)"
```

---

### Task 3: Route guard tests — member scoping + cross-company 404

These lock in the backend contract the dialog relies on (the routes are unchanged), and add the mandatory cross-company 404 for the CSV read endpoint. Both suites **pass against the current routes**.

**Files:**

- Modify: `apps/web/tests/services/reports-export-pdf-route.test.ts` (append two `it` blocks inside the existing `describe`)
- Create: `apps/web/tests/services/reports-export-csv-route.test.ts`

- [ ] **Step 1: Add PDF-route US-89 cases**

In `apps/web/tests/services/reports-export-pdf-route.test.ts`, add these two `it` blocks inside `describe('GET /api/reports/export.pdf', …)` (after the existing tests). They reuse the file's `reqUrl`, `ctx`, `withTx`, and `createCompany` imports:

```ts
it('US-89: exports a single member-scoped PDF', async () => {
  await withTx(async (tx) => {
    ctx.db = tx;
    const admin = await tx.user.create({ data: { email: 'pdf-s-a@x.test', fullName: 'Scoped A' } });
    const company = await createCompany(tx, { name: 'Scoped Co', createdByUserId: admin.id });
    await tx.timeEntry.create({
      data: {
        userId: admin.id,
        companyId: company.id,
        description: 'Květnová práce',
        startedAt: new Date('2026-05-10T08:00:00Z'),
        endedAt: new Date('2026-05-10T11:00:00Z'),
      },
    });
    ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

    const res = await GET(
      reqUrl(`from=2026-05-01&to=2026-06-01&member=${admin.id}&groupBy=member`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

it('US-89: returns 404 for a member-scoped export in a company the user does not belong to', async () => {
  await withTx(async (tx) => {
    ctx.db = tx;
    const outsider = await tx.user.create({ data: { email: 'pdf-s-o@x.test', fullName: 'Out' } });
    const founder = await tx.user.create({ data: { email: 'pdf-s-f@x.test', fullName: 'Fnd' } });
    const foreign = await createCompany(tx, {
      name: 'Foreign Scoped',
      createdByUserId: founder.id,
    });
    ctx.session = { userId: outsider.id, activeCompanyId: foreign.id, activeRole: 'admin' };

    const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&member=${founder.id}`));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Create the CSV-route test**

Create `apps/web/tests/services/reports-export-csv-route.test.ts`:

```ts
/** Phase 12 — CSV export route. Covers US-89 member scoping + mandatory cross-company 404. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { setNowProvider } from '@tt/shared/time';
import { createCompany } from '../../src/lib/services/companies.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  session: null as unknown as {
    userId: string;
    activeCompanyId: string;
    activeRole: 'admin' | 'user';
  },
}));

vi.mock('@/lib/session', () => ({
  prisma: () => ctx.db,
  requireActiveCompany: async () => ctx.session,
}));

const { GET } = await import('../../src/app/api/reports/export.csv/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
  setNowProvider(null);
});
beforeEach(() => {
  setNowProvider(() => new Date('2026-06-01T10:00:00Z'));
});

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/reports/export.csv?${qs}`);
}

describe('GET /api/reports/export.csv', () => {
  it('US-89: scopes the CSV to the selected member only', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'csv-a@x.test', fullName: 'Admin A' } });
      const company = await createCompany(tx, { name: 'CSV Co', createdByUserId: admin.id });
      const bob = await tx.user.create({ data: { email: 'csv-b@x.test', fullName: 'Bob B' } });
      await tx.membership.create({ data: { userId: bob.id, companyId: company.id, role: 'user' } });
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          description: 'ADMIN_WORK',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T09:00:00Z'),
        },
      });
      await tx.timeEntry.create({
        data: {
          userId: bob.id,
          companyId: company.id,
          description: 'BOB_WORK',
          startedAt: new Date('2026-05-11T08:00:00Z'),
          endedAt: new Date('2026-05-11T09:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&member=${bob.id}`));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('BOB_WORK');
      expect(body).not.toContain('ADMIN_WORK');
    });
  });

  it('US-89: returns 404 when the active company is one the user does not belong to', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'csv-o@x.test', fullName: 'Out' } });
      const founder = await tx.user.create({ data: { email: 'csv-f@x.test', fullName: 'Fnd' } });
      const foreign = await createCompany(tx, { name: 'Foreign CSV', createdByUserId: founder.id });
      ctx.session = { userId: outsider.id, activeCompanyId: foreign.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&member=${founder.id}`));
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 3: Run both route suites**

Run: `pnpm --filter @tt/web exec vitest run tests/services/reports-export-pdf-route.test.ts tests/services/reports-export-csv-route.test.ts`
Expected: PASS (existing US-78 tests + 2 new US-89 PDF cases + 2 US-89 CSV cases). First run spins up Postgres (~up to 180s).

- [ ] **Step 4: Commit** _(deferred to `/plane-task finish`)_

```bash
git add apps/web/tests/services/reports-export-pdf-route.test.ts \
        apps/web/tests/services/reports-export-csv-route.test.ts
git commit -m "test(reports): US-89 member-scoped export + CSV cross-company 404"
```

---

### Task 4: ExportDialog component, MultiSelect callback, page wiring, i18n

No unit test (the repo has no React component-test harness); the pure logic it composes is covered by Tasks 1–2. Verified via typecheck + lint + build.

**Files:**

- Modify: `apps/web/src/components/MultiSelect.tsx`
- Create: `apps/web/src/app/(authenticated)/reports/ExportDialog.tsx`
- Modify: `apps/web/src/app/(authenticated)/reports/page.tsx`
- Modify: `apps/web/messages/cs.json`

**Interfaces:**

- Consumes: `PRESETS`, `preset` (Task 1); `buildExportUrl`, `resolveExportGroupBy`, `ExportUrlInput` (Task 2); `ConfirmModal` from `@tt/ui`; `MultiSelect` from `@/components/MultiSelect`; `GroupBy` from `@/lib/services/reports`.
- Produces: `ExportDialog` (default-styled trigger + modal) with props `{ isAdmin: boolean; meId: string; members: {id: string; name: string}[]; initial: {from: string; to: string; memberIds: string[]} }`.

- [ ] **Step 1: Add an optional `onChange` to `MultiSelect`**

In `apps/web/src/components/MultiSelect.tsx`:

1. Add `useEffect` to the React import if not already present (it is: line 4 imports `useEffect`).
2. Add to `MultiSelectProps`:

```ts
  /** Optional: called with the selected ids whenever the selection changes. */
  onChange?: (selectedIds: string[]) => void;
```

3. Destructure `onChange` in the component signature (add it to the props list).
4. After the `const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues));` line, add:

```ts
useEffect(() => {
  onChange?.(Array.from(selected));
}, [selected, onChange]);
```

(Existing form-based consumers pass no `onChange`, so behavior is unchanged. `onChange` must be a stable reference — the dialog passes React's `setState`, which is stable.)

- [ ] **Step 2: Create `ExportDialog`**

Create `apps/web/src/app/(authenticated)/reports/ExportDialog.tsx`:

```tsx
'use client';

import { useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@tt/ui';
import { MultiSelect } from '@/components/MultiSelect';
import type { GroupBy } from '@/lib/services/reports';
import { PRESETS, preset } from './date-presets';
import { buildExportUrl, resolveExportGroupBy } from './export-url';

interface Member {
  id: string;
  name: string;
}

export interface ExportDialogProps {
  isAdmin: boolean;
  meId: string;
  members: Member[];
  initial: { from: string; to: string; memberIds: string[] };
}

const GROUP_KEYS: GroupBy[] = ['project', 'member', 'day'];

function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function chipClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
  }`;
}

export function ExportDialog({ isAdmin, meId, members, initial }: ExportDialogProps): ReactElement {
  const t = useTranslations('reports');
  const [open, setOpen] = useState(false);

  const seeded =
    initial.from && initial.to
      ? { from: initial.from, to: initial.to }
      : preset('lastMonth', new Date());
  const [from, setFrom] = useState(seeded.from);
  const [to, setTo] = useState(seeded.to);
  const [allMembers, setAllMembers] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>(
    initial.memberIds.length > 0 ? initial.memberIds : [meId],
  );
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [groupOverride, setGroupOverride] = useState<GroupBy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveGroupBy: GroupBy =
    groupOverride ?? resolveExportGroupBy(isAdmin && allMembers, isAdmin ? memberIds.length : 1);

  function handleConfirm(): void {
    if (from && to && from > to) {
      setError(t('export.invalidRange'));
      return;
    }
    triggerDownload(
      buildExportUrl({
        format,
        from,
        to,
        allMembers: isAdmin && allMembers,
        memberIds: isAdmin && !allMembers ? memberIds : [],
        groupBy: effectiveGroupBy,
      }),
    );
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 sm:w-auto"
      >
        {t('export.button')}
      </button>

      <ConfirmModal
        open={open}
        title={t('export.dialogTitle')}
        confirmLabel={t('export.submit')}
        onConfirm={handleConfirm}
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
      >
        <div className="space-y-4">
          {/* Period */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.periodLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const r = preset(p.key, new Date());
                const active = from === r.from && to === r.to;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setFrom(r.from);
                      setTo(r.to);
                    }}
                    className={chipClass(active)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none sm:w-auto dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <span className="hidden text-zinc-400 sm:inline dark:text-zinc-500">–</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none sm:w-auto dark:border-zinc-700 dark:focus:border-zinc-100"
              />
            </div>
          </div>

          {/* Person — admin only */}
          {isAdmin ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('export.personLabel')}
              </p>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={allMembers}
                  onChange={(e) => setAllMembers(e.target.checked)}
                />
                {t('export.allMembers')}
              </label>
              {!allMembers ? (
                <MultiSelect
                  name="member"
                  options={members.map((m) => ({ id: m.id, label: m.name }))}
                  defaultValues={memberIds}
                  onChange={setMemberIds}
                  placeholder={t('export.personLabel')}
                />
              ) : null}
            </div>
          ) : null}

          {/* Format */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.formatLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={chipClass(format === 'pdf')}
              >
                {t('export.format.pdf')}
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={chipClass(format === 'csv')}
              >
                {t('export.format.csv')}
              </button>
            </div>
          </div>

          {/* Grouping */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.groupingLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {GROUP_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupOverride(key)}
                  className={chipClass(effectiveGroupBy === key)}
                >
                  {t(`groupBy.${key}`)}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </ConfirmModal>
    </>
  );
}
```

- [ ] **Step 3: Wire `ExportDialog` into the reports page**

In `apps/web/src/app/(authenticated)/reports/page.tsx`:

1. Add import: `import { ExportDialog } from './ExportDialog';`
2. **Delete** the `exportQS` block (the `const exportQS = new URLSearchParams(); … exportQS.set('groupBy', groupBy);` lines, ~85–90).
3. Replace the entire `actions={ … }` prop of `<PageHeader>` (the `<div>` with the three `<a>` links) with:

```tsx
        actions={
          <ExportDialog
            isAdmin={isAdmin}
            meId={s.userId}
            members={members.map((m) => ({ id: m.userId, name: m.user.fullName }))}
            initial={{ from: sp.from ?? '', to: sp.to ?? '', memberIds: asArray(sp.member) }}
          />
        }
```

(`isAdmin`, `members`, `s`, `sp`, `asArray` are already in scope. `members` is `[]` for non-admins, and `isAdmin` is false, so the dialog hides the person field.)

- [ ] **Step 4: Replace the `reports.export` i18n subtree**

In `apps/web/messages/cs.json`, replace the existing `reports.export` object with:

```json
    "export": {
      "button": "Export",
      "dialogTitle": "Exportovat výkaz",
      "periodLabel": "Období",
      "personLabel": "Osoba",
      "allMembers": "Všichni členové",
      "formatLabel": "Formát",
      "groupingLabel": "Seskupení",
      "submit": "Exportovat",
      "invalidRange": "Datum „od\" nesmí být pozdější než „do\".",
      "format": { "pdf": "PDF", "csv": "CSV" }
    },
```

(Removes the old `csv` / `xlsx` / `pdf` / `lastMonth` keys — none are referenced anymore.)

- [ ] **Step 5: Confirm no dangling references to removed strings**

Run: `grep -rn "export\.lastMonth\|export\.xlsx\|export\.pdf\|export\.csv" apps/web/src`
Expected: no matches (all three `<a>` buttons are gone). If any remain, fix them.

- [ ] **Step 6: Typecheck, lint, build**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web build`
Expected: all clean. (Catches i18n key-typing errors, unused `exportQS`, and MV/SSR issues.)

- [ ] **Step 7: Commit** _(deferred to `/plane-task finish`)_

```bash
git add apps/web/src/components/MultiSelect.tsx \
        apps/web/src/app/'(authenticated)'/reports/ExportDialog.tsx \
        apps/web/src/app/'(authenticated)'/reports/page.tsx \
        apps/web/messages/cs.json
git commit -m "feat(reports): Export dialog — pick period + person(s) → PDF/CSV (US-89)"
```

---

### Task 5: Trace bump + docs + full verification

**Files:**

- Modify: `scripts/test-trace.ts`
- Modify: `docs/reference/features.md`
- Modify: `docs/reference/acceptance.md`

- [ ] **Step 1: Bump the trace total**

In `scripts/test-trace.ts` line 10: change `const TOTAL_US = 88;` to `const TOTAL_US = 89;`.

- [ ] **Step 2: Record US-89 in `features.md`**

In `docs/reference/features.md`:

1. Line 1 heading `# Features (US-1 … US-88)` → `# Features (US-1 … US-89)`.
2. In the `## Reports — grouped view + PDF export` section (after the existing US-78 line ~130), add:

```markdown
- **US-89** — Reports **Export dialog**: one "Export" button opens a dialog to pick the **period**, the **person(s)** (or "Všichni členové"), and the **format** (PDF/CSV). The export is scoped to that selection instead of always dumping every member together, and the three old header export buttons are removed. Grouping defaults to per-member sections when several/all people are exported. (Route logic unchanged; see `export-url.test.ts` + `reports-export-csv-route.test.ts`.)
```

- [ ] **Step 3: Record US-89 in `acceptance.md`**

In `docs/reference/acceptance.md`, under the reports export section (after the US-78 lines ~42–43), add:

```markdown
- [x] **Reports Export dialog scopes exports to a chosen period + person(s); cross-company 404.**
  - `apps/web/tests/services/export-url.test.ts`, `date-presets.test.ts` — US-89 (URL + grouping + presets).
  - `apps/web/tests/services/reports-export-pdf-route.test.ts`, `reports-export-csv-route.test.ts` — US-89 (member-scoped export + cross-company 404).
```

- [ ] **Step 4: Run the trace + the full new-suite set**

Run: `pnpm test:trace`
Expected: `US coverage: 89/89 (100.0%)` and `All user stories have test coverage.`

Run: `pnpm --filter @tt/web exec vitest run tests/services/date-presets.test.ts tests/services/export-url.test.ts tests/services/reports-export-pdf-route.test.ts tests/services/reports-export-csv-route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web build`
Expected: clean.

- [ ] **Step 6: Commit** _(deferred to `/plane-task finish`)_

```bash
git add scripts/test-trace.ts docs/reference/features.md docs/reference/acceptance.md
git commit -m "docs(reports): trace US-89 export dialog; bump TOTAL_US to 89"
```

---

## Spec coverage self-check

| Spec requirement                                                        | Task                                     |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| One "Export" button replaces the 3 header buttons                       | Task 4 (page.tsx)                        |
| Dialog: period (presets + custom), default last month                   | Task 1 + Task 4                          |
| Dialog: person(s), admin-only, default self, explicit "Všichni členové" | Task 4                                   |
| Dialog: format PDF/CSV (keeps CSV alive)                                | Task 2 + Task 4                          |
| Dialog: grouping smart default (member for all/multi, else project)     | Task 2 (`resolveExportGroupBy`) + Task 4 |
| `member` omitted for "all"; explicit from/to; no `preset` path          | Task 2 (`buildExportUrl`)                |
| Non-admin: person field hidden, scoped to self by the route             | Task 4 (`isAdmin` gate)                  |
| Member selection readable in JS                                         | Task 4 (`MultiSelect.onChange`)          |
| US-89 tests: URL, grouping, presets, member-scope, cross-company 404    | Tasks 1–3                                |
| Docs + trace to 100%                                                    | Task 5                                   |
| No backend/route change; read-only (no audit)                           | Honored (routes untouched)               |
