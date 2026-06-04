# AIAGE-25 Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken dashboard Stop button and add five Chrome-extension improvements (HH:MM display, bigger Stop button, inline entry editing, manual entry, admin project creation) from Plane AIAGE-25.

**Architecture:** The web business logic already exists and is tested (`updateEntry`, `createManualEntry`, `createProject`). We add three thin v1 REST endpoints that wrap those services (token auth + company scoping + existence-safe 404), wire the extension's REST client + offline queue to them, and build one shared overlay `EntrySheet` for edit & manual entry. The dashboard fix and the two display tweaks are small frontend changes.

**Tech Stack:** TypeScript (strict), Next.js 15 route handlers, Prisma 6 / Postgres (testcontainers — Docker must be running for backend tests), Vitest, Playwright, Vite + React MV3 extension (REST over `fetch`, no tRPC, hardcoded Czech strings).

**Branch:** Do all work on `feat/aiage-25-time-tracking` (do not commit to `main`).

**Conventions observed:**

- v1 routes use `resolveApiSession(req)` (401 if null) and `pickActiveCompany(session, preferred)`; responses via `jsonCors`/`errorCors`/`corsPreflight` from `@/lib/api/cors`. Cross-company / not-owner cases map to **404** (existence-safe).
- Extension strings are hardcoded Czech (no `next-intl`). Imports use explicit `.js` extensions.
- Run a single web test: `pnpm --filter ./apps/web exec vitest run <file>`. Single extension test: `pnpm --filter ./apps/extension exec vitest run <file>`.

---

## Task 1: AIAGE-31 — Fix the dashboard Stop button width

**Root cause:** the Stop button was given icon-only square sizing (`h-10 w-10 sm:h-8 sm:w-8`, same as the `✎` edit button) but renders the text `■ Stop`. With the shared Button's `whitespace-nowrap` + `px-3`, the label can't fit a 32–40px square and overflows.

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx:151`
- Test: `apps/web/tests/e2e/time-entry-edit.spec.ts` (add a width-regression guard)

- [ ] **Step 1: Add a failing width guard to the existing e2e**

In `apps/web/tests/e2e/time-entry-edit.spec.ts`, replace the line at `:16`:

```ts
// Stop the timer immediately so the entry lands in the Today list.
await page.getByRole('button', { name: '■ Stop' }).first().click();
```

with:

```ts
// Stop the timer immediately so the entry lands in the Today list.
const stopButton = page.getByRole('button', { name: '■ Stop' }).first();
await expect(stopButton).toBeVisible();
// AIAGE-31 regression: the label "■ Stop" must fit — a square icon-sized
// button (~32px) clips it. A real labelled button is ~70px wide.
const stopBox = await stopButton.boundingBox();
expect(stopBox?.width ?? 0).toBeGreaterThan(56);
await stopButton.click();
```

- [ ] **Step 2: Run the e2e and watch it fail**

Run: `pnpm --filter ./apps/web exec playwright test tests/e2e/time-entry-edit.spec.ts -g "changes end"`
Expected: FAIL — `expect(received).toBeGreaterThan(56)` (button is ~32px wide).

- [ ] **Step 3: Fix the button sizing**

In `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`, change the Stop button's `className` (line 151):

```tsx
<Button
  variant="danger"
  size="sm"
  loading={pending}
  onClick={() => void handleStop()}
  className="h-10 sm:h-8"
>
  ■ Stop
</Button>
```

(Drop the fixed `w-10 sm:w-8`; keep `h-10 sm:h-8` for tap-target parity with the edit button. The label now sizes naturally via `size="sm"`.)

- [ ] **Step 4: Run the e2e and watch it pass**

Run: `pnpm --filter ./apps/web exec playwright test tests/e2e/time-entry-edit.spec.ts`
Expected: PASS (all three US-54 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/timer/RunningTimers.tsx apps/web/tests/e2e/time-entry-edit.spec.ts
git commit -m "fix(timer): stop button label no longer clipped by icon-only width (AIAGE-31)"
```

---

## Task 2: AIAGE-28 — Show HH:MM (no seconds) in the extension

The colon-formatted `fmtDuration` (HH:MM:SS) is used at three sites: the live running timer, the history group total, and per-entry history duration. `fmtHM` (summary cards, `Xh Ym`) is already seconds-free and stays. Extract a tested `fmtDurationHM` and swap the three sites; widen the 1-second tick since the display now changes per minute.

**Files:**

- Create: `apps/extension/src/format.ts`
- Create: `apps/extension/src/format.test.ts`
- Modify: `apps/extension/src/popup.tsx` (remove local `fmtDuration`, swap 3 call sites, widen tick)

- [ ] **Step 1: Write the failing test**

Create `apps/extension/src/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fmtDurationHM } from './format.js';

describe('fmtDurationHM', () => {
  it('formats hours and minutes with zero padding, no seconds', () => {
    expect(fmtDurationHM(0)).toBe('00:00');
    expect(fmtDurationHM(90 * 60_000)).toBe('01:30');
    expect(fmtDurationHM(5 * 3_600_000 + 7 * 60_000)).toBe('05:07');
  });

  it('floors sub-minute remainders and clamps negatives', () => {
    expect(fmtDurationHM(59_000)).toBe('00:00');
    expect(fmtDurationHM(61_000)).toBe('00:01');
    expect(fmtDurationHM(-5_000)).toBe('00:00');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/extension exec vitest run src/format.test.ts`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Implement `format.ts`**

Create `apps/extension/src/format.ts`:

```ts
/** Duration as HH:MM (seconds intentionally omitted — see AIAGE-28). */
export function fmtDurationHM(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/extension exec vitest run src/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Swap the call sites in `popup.tsx`**

Add the import near the other local imports (after the `./api.js` import block):

```ts
import { fmtDurationHM } from './format.js';
```

Delete the local `fmtDuration` definition (lines 342-348):

```ts
function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
```

Replace the three usages:

- Live timer (`:890`): `{fmtDuration(now - new Date(e.startedAt).getTime())}` → `{fmtDurationHM(now - new Date(e.startedAt).getTime())}`
- History group total (`:966`): `{fmtDuration(g.total)}` → `{fmtDurationHM(g.total)}`
- History entry duration (`:987-989`): `fmtDuration(new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime())` → `fmtDurationHM(new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime())`

Widen the tick in `AppShell` (`:363`) from 1s to 30s, since the display only changes per minute:

```ts
const t = setInterval(() => setNow(Date.now()), 30_000);
```

- [ ] **Step 6: Typecheck + full extension tests**

Run: `pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension test`
Expected: PASS (no lingering `fmtDuration` references).

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/format.ts apps/extension/src/format.test.ts apps/extension/src/popup.tsx
git commit -m "feat(extension): show durations as HH:MM, drop seconds (AIAGE-28)"
```

---

## Task 3: AIAGE-29 — Make the extension Stop button bigger

**Files:**

- Modify: `apps/extension/src/popup.tsx` (`RunningList` stop button, `:892-898`)

- [ ] **Step 1: Enlarge the button**

Replace the Stop button in `RunningList`:

```tsx
<button
  type="button"
  onClick={() => void onStop(e.id)}
  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
>
  Stop
</button>
```

(Was `px-2 py-1 text-[10px]` → now `px-4 py-2 text-sm`, the dominant control in the row.)

- [ ] **Step 2: Verify build + typecheck**

Run: `pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension build`
Expected: PASS.

- [ ] **Step 3: Manual check**

Load the unpacked extension (`apps/extension/dist`), start a timer, confirm the Stop button is visibly larger and easy to tap.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/popup.tsx
git commit -m "feat(extension): larger, prominent Stop button (AIAGE-29)"
```

---

## Task 4: Add an audit row to `createProject`

`createProject` currently writes no audit row, violating the "every mutation → exactly one audit row" rule. Fix the service before exposing it via REST.

**Files:**

- Modify: `apps/web/src/lib/services/catalog.ts` (`createProject`, `:184-195`)
- Test: `apps/web/tests/services/catalog.test.ts` (add an audit-count assertion)

- [ ] **Step 1: Write the failing test**

In `apps/web/tests/services/catalog.test.ts`, add inside the `describe('catalog ...')` block (it already has `bootstrap` and `auditCount` helpers, and imports `createClient`/`createProject`):

```ts
it('US-14: creating a project writes exactly one audit row', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'proj-audit');
    const client = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
    if (!client.ok) throw new Error('setup');
    const before = await auditCount(tx, w.company);
    const project = await createProject(tx, w.admin, {
      clientId: client.value.id,
      name: 'Website',
    });
    expect(project.ok).toBe(true);
    expect((await auditCount(tx, w.company)) - before).toBe(1);
    const rows = await tx.auditLog.findMany({
      where: { companyId: w.company, entityType: 'Project' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('create');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/catalog.test.ts -t "creating a project writes"`
Expected: FAIL — audit count delta is 0, `rows` has length 0.

- [ ] **Step 3: Add the audit write**

In `apps/web/src/lib/services/catalog.ts`, update `createProject` (`writeAudit` is already imported at `:13`):

```ts
export async function createProject(
  db: Db,
  actorUserId: string,
  input: { clientId: string; name: string },
): Promise<Result<{ id: string }>> {
  const c = await db.client.findUnique({ where: { id: input.clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return auth;
  const p = await db.project.create({ data: { clientId: input.clientId, name: input.name } });
  await writeAudit(db, {
    companyId: c.companyId,
    actorUserId,
    action: 'create',
    entityType: 'Project',
    entityId: p.id,
    after: { clientId: input.clientId, name: input.name },
  });
  return { ok: true, value: { id: p.id } };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/catalog.ts apps/web/tests/services/catalog.test.ts
git commit -m "fix(catalog): createProject writes an audit row (AIAGE-30 prep)"
```

---

## Task 5: Backend — `POST /api/v1/projects`

Thin endpoint wrapping `createProject`. Admin-only (the service's `requireAdmin` returns `not_found` for non-admins / cross-company → mapped to existence-safe 404).

**Files:**

- Create: `apps/web/src/app/api/v1/projects/route.ts`
- Test: `apps/web/tests/services/v1-projects-route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `apps/web/tests/services/v1-projects-route.test.ts`:

```ts
/** v1 POST /projects — create a project from the extension (AIAGE-30). Covers US-14 + cross-company 404. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient } from '../../src/lib/services/catalog.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  userId: '',
}));

vi.mock('@/lib/session', () => ({ prisma: () => ctx.db }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          memberships: [],
        }
      : null,
  pickActiveCompany: () => null,
}));

const { POST } = await import('../../src/app/api/v1/projects/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/projects', () => {
  it('US-14: admin creates a project under an existing client', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'pr-a@x.test', fullName: 'A' } });
      const company = await createCompany(tx, { name: 'Pr Co', createdByUserId: admin.id });
      const client = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      ctx.userId = admin.id;

      const res = await POST(postReq({ clientId: client.value.id, name: 'Website' }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id: string };
      const created = await tx.project.findUnique({ where: { id: json.id } });
      expect(created?.name).toBe('Website');
    });
  });

  it('US-14: returns 404 for a non-admin member (no existence leak)', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'pr-a2@x.test', fullName: 'A' } });
      const member = await tx.user.create({ data: { email: 'pr-m@x.test', fullName: 'M' } });
      const company = await createCompany(tx, { name: 'Pr Co2', createdByUserId: admin.id });
      await tx.membership.create({
        data: { userId: member.id, companyId: company.id, role: 'user' },
      });
      const client = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      ctx.userId = member.id;

      const res = await POST(postReq({ clientId: client.value.id, name: 'Nope' }));
      expect(res.status).toBe(404);
    });
  });

  it('US-14: returns 404 when the client belongs to another company', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'pr-o@x.test', fullName: 'O' } });
      const founder = await tx.user.create({ data: { email: 'pr-f@x.test', fullName: 'F' } });
      const foreign = await createCompany(tx, { name: 'Foreign', createdByUserId: founder.id });
      const client = await createClient(tx, founder.id, { companyId: foreign.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      ctx.userId = outsider.id;

      const res = await POST(postReq({ clientId: client.value.id, name: 'Nope' }));
      expect(res.status).toBe(404);
    });
  });

  it('returns 400 when clientId or name is missing', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'pr-a3@x.test', fullName: 'A' } });
      ctx.userId = admin.id;
      const res = await POST(postReq({ name: 'No client' }));
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-projects-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/v1/projects/route.ts`:

```ts
/** POST /api/v1/projects → create a project under an existing client (admin-only). */
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { createProject } from '@/lib/services/catalog';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  let body: { clientId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  const clientId = body.clientId?.trim();
  const name = body.name?.trim();
  if (!clientId || !name) return errorCors(req, 400, 'invalid');
  const result = await createProject(prisma(), session.userId, { clientId, name });
  if (!result.ok) return errorCors(req, 404, result.reason);
  return jsonCors(req, { id: result.value.id });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-projects-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/projects/route.ts apps/web/tests/services/v1-projects-route.test.ts
git commit -m "feat(api): POST /api/v1/projects creates a project (AIAGE-30)"
```

---

## Task 6: Backend — `PATCH /api/v1/entries/[id]`

Add `PATCH` next to the existing `DELETE`. Wraps `updateEntry` (owner-or-admin; `not_found` for cross-company/not-owner → 404; `invalid_window`/`future_timestamp` → 422).

**Files:**

- Modify: `apps/web/src/app/api/v1/entries/[id]/route.ts`
- Test: `apps/web/tests/services/v1-entries-update-route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `apps/web/tests/services/v1-entries-update-route.test.ts`:

```ts
/** v1 PATCH /entries/[id] — edit an entry from the extension (AIAGE-26). Covers US-24/US-28 + cross-company 404. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { startTimer } from '../../src/lib/services/time-entries.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  userId: '',
}));

vi.mock('@/lib/session', () => ({ prisma: () => ctx.db }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          memberships: [],
        }
      : null,
  pickActiveCompany: () => null,
}));

const { PATCH } = await import('../../src/app/api/v1/entries/[id]/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

function patchReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/entries/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

describe('PATCH /api/v1/entries/[id]', () => {
  it('US-24: owner edits description and client', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'ed-u@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Ed Co', createdByUserId: user.id });
      const started = await startTimer(tx, user.id, { companyId: company.id, description: 'orig' });
      if (!started.ok) throw new Error('setup');
      ctx.userId = user.id;

      const res = await PATCH(
        patchReq(started.value.id, { description: 'updated' }),
        params(started.value.id),
      );
      expect(res.status).toBe(200);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: started.value.id } });
      expect(reread.description).toBe('updated');
    });
  });

  it('US-24: writes exactly one audit row for the update', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'ed-a@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Ed Co2', createdByUserId: user.id });
      const started = await startTimer(tx, user.id, { companyId: company.id, description: 'orig' });
      if (!started.ok) throw new Error('setup');
      ctx.userId = user.id;

      const before = await tx.auditLog.count({
        where: { entityId: started.value.id, action: 'update' },
      });
      await PATCH(patchReq(started.value.id, { description: 'v2' }), params(started.value.id));
      const after = await tx.auditLog.count({
        where: { entityId: started.value.id, action: 'update' },
      });
      expect(after - before).toBe(1);
    });
  });

  it('US-24: returns 404 when the entry belongs to another company', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const owner = await tx.user.create({ data: { email: 'ed-own@x.test', fullName: 'O' } });
      const outsider = await tx.user.create({ data: { email: 'ed-out@x.test', fullName: 'X' } });
      const company = await createCompany(tx, { name: 'Ed Co3', createdByUserId: owner.id });
      const started = await startTimer(tx, owner.id, {
        companyId: company.id,
        description: 'orig',
      });
      if (!started.ok) throw new Error('setup');
      ctx.userId = outsider.id;

      const res = await PATCH(
        patchReq(started.value.id, { description: 'hax' }),
        params(started.value.id),
      );
      expect(res.status).toBe(404);
    });
  });

  it('US-28: returns 422 when end precedes start (invalid window)', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'ed-w@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Ed Co4', createdByUserId: user.id });
      const started = await startTimer(tx, user.id, { companyId: company.id, description: 'orig' });
      if (!started.ok) throw new Error('setup');
      ctx.userId = user.id;

      const res = await PATCH(
        patchReq(started.value.id, {
          startedAt: '2026-05-10T10:00:00.000Z',
          endedAt: '2026-05-10T09:00:00.000Z',
        }),
        params(started.value.id),
      );
      expect(res.status).toBe(422);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-entries-update-route.test.ts`
Expected: FAIL — `PATCH` is not exported from the route module.

- [ ] **Step 3: Add the PATCH handler**

Edit `apps/web/src/app/api/v1/entries/[id]/route.ts` to add `PATCH` (keep the existing `OPTIONS` and `DELETE`):

```ts
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { softDeleteEntry, updateEntry, type UpdateEntryPatch } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  let body: {
    description?: string;
    clientId?: string | null;
    projectId?: string | null;
    startedAt?: string;
    endedAt?: string | null;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }

  const patch: UpdateEntryPatch = {};
  if (body.description !== undefined) patch.description = body.description;
  if (body.clientId !== undefined) patch.clientId = body.clientId;
  if (body.projectId !== undefined) patch.projectId = body.projectId;
  if (body.tagIds !== undefined) patch.tagIds = body.tagIds;
  if (body.startedAt !== undefined) {
    const d = new Date(body.startedAt);
    if (Number.isNaN(d.getTime())) return errorCors(req, 400, 'invalid_date');
    patch.startedAt = d;
  }
  if (body.endedAt !== undefined) {
    if (body.endedAt === null) {
      patch.endedAt = null;
    } else {
      const d = new Date(body.endedAt);
      if (Number.isNaN(d.getTime())) return errorCors(req, 400, 'invalid_date');
      patch.endedAt = d;
    }
  }

  const result = await updateEntry(prisma(), session.userId, id, patch);
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const result = await softDeleteEntry(prisma(), session.userId, id);
  if (!result.ok) return errorCors(req, 404, result.reason);
  return jsonCors(req, { ok: true });
}
```

(`UpdateEntryPatch` is exported from `time-entries.ts` at `:213`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-entries-update-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/v1/entries/[id]/route.ts" apps/web/tests/services/v1-entries-update-route.test.ts
git commit -m "feat(api): PATCH /api/v1/entries/[id] edits an entry (AIAGE-26)"
```

---

## Task 7: Backend — `POST /api/v1/entries` (manual entry)

New collection route (alongside the `[id]` route). Wraps `createManualEntry`; company from `?company=`; `not_found` → 404, `invalid_window`/`future_timestamp` → 422.

**Files:**

- Create: `apps/web/src/app/api/v1/entries/route.ts`
- Test: `apps/web/tests/services/v1-entries-create-route.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `apps/web/tests/services/v1-entries-create-route.test.ts`:

```ts
/** v1 POST /entries — create a manual entry from the extension (AIAGE-34). Covers US-19/US-20 + cross-company 404. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';

const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  userId: '',
  active: null as { companyId: string; role: 'admin' | 'user' } | null,
}));

vi.mock('@/lib/session', () => ({ prisma: () => ctx.db }));
vi.mock('@/lib/api/auth', () => ({
  resolveApiSession: async () =>
    ctx.userId
      ? {
          userId: ctx.userId,
          email: '',
          fullName: '',
          totpEnabled: false,
          theme: 'system',
          memberships: [],
        }
      : null,
  pickActiveCompany: () => ctx.active,
}));

const { POST } = await import('../../src/app/api/v1/entries/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/entries', () => {
  it('US-19: member creates a manual entry with a past window', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'mn-u@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Mn Co', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.active = { companyId: company.id, role: 'admin' };

      const res = await POST(
        postReq({
          description: 'Manual work',
          startedAt: '2026-05-10T08:00:00.000Z',
          endedAt: '2026-05-10T10:00:00.000Z',
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id: string };
      const created = await tx.timeEntry.findUnique({ where: { id: json.id } });
      expect(created?.description).toBe('Manual work');
      expect(created?.endedAt?.toISOString()).toBe('2026-05-10T10:00:00.000Z');
    });
  });

  it('US-19: returns 404 when the active company is one the user does not belong to', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'mn-o@x.test', fullName: 'O' } });
      const founder = await tx.user.create({ data: { email: 'mn-f@x.test', fullName: 'F' } });
      const foreign = await createCompany(tx, { name: 'Foreign', createdByUserId: founder.id });
      ctx.userId = outsider.id;
      ctx.active = { companyId: foreign.id, role: 'admin' };

      const res = await POST(
        postReq({ startedAt: '2026-05-10T08:00:00.000Z', endedAt: '2026-05-10T10:00:00.000Z' }),
      );
      expect(res.status).toBe(404);
    });
  });

  it('US-20: returns 422 when end precedes start', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'mn-w@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Mn Co2', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.active = { companyId: company.id, role: 'admin' };

      const res = await POST(
        postReq({ startedAt: '2026-05-10T10:00:00.000Z', endedAt: '2026-05-10T09:00:00.000Z' }),
      );
      expect(res.status).toBe(422);
    });
  });

  it('returns 400 when the window is missing', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'mn-m@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Mn Co3', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.active = { companyId: company.id, role: 'admin' };

      const res = await POST(postReq({ description: 'no window' }));
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-entries-create-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/v1/entries/route.ts`:

```ts
/** POST /api/v1/entries → create a manual (completed) time entry in the active company. */
import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { createManualEntry } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return errorCors(req, 404, 'no_company');

  let body: {
    description?: string;
    clientId?: string | null;
    projectId?: string | null;
    startedAt?: string;
    endedAt?: string;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  if (!body.startedAt || !body.endedAt) return errorCors(req, 400, 'missing_window');
  const startedAt = new Date(body.startedAt);
  const endedAt = new Date(body.endedAt);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return errorCors(req, 400, 'invalid_date');
  }

  const result = await createManualEntry(prisma(), session.userId, {
    companyId: active.companyId,
    description: body.description ?? '',
    clientId: body.clientId ?? null,
    projectId: body.projectId ?? null,
    startedAt,
    endedAt,
    tagIds: body.tagIds ?? [],
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { id: result.value.id });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/web exec vitest run tests/services/v1-entries-create-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/entries/route.ts apps/web/tests/services/v1-entries-create-route.test.ts
git commit -m "feat(api): POST /api/v1/entries creates a manual entry (AIAGE-34)"
```

---

## Task 8: Extension REST client — `updateEntry`, `createManualEntry`, `createProject`

**Files:**

- Modify: `apps/extension/src/api.ts`

- [ ] **Step 1: Add the new types and calls**

Append to `apps/extension/src/api.ts` (before the final `export { ApiError };`):

```ts
export interface UpdateEntryPatch {
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  startedAt?: string; // ISO
  endedAt?: string | null; // ISO, or null to clear (re-open a running timer)
  tagIds?: string[];
}

export async function updateEntry(
  session: ApiSession,
  entryId: string,
  patch: UpdateEntryPatch,
): Promise<void> {
  await call(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    session.token,
  );
}

export interface ManualEntryApiInput {
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  startedAt: string; // ISO
  endedAt: string; // ISO
  tagIds?: string[];
}

export async function createManualEntry(
  session: ApiSession,
  companyId: string | null,
  input: ManualEntryApiInput,
): Promise<{ id: string }> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<{ id: string }>(
    session.apiBase,
    `/api/v1/entries${qs}`,
    { method: 'POST', body: JSON.stringify(input) },
    session.token,
  );
}

export async function createProject(
  session: ApiSession,
  input: { clientId: string; name: string },
): Promise<{ id: string }> {
  return call<{ id: string }>(
    session.apiBase,
    '/api/v1/projects',
    { method: 'POST', body: JSON.stringify(input) },
    session.token,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter ./apps/extension typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/api.ts
git commit -m "feat(extension): REST calls for updateEntry, createManualEntry, createProject"
```

---

## Task 9: Extension datetime helpers for `<input type="datetime-local">`

**Files:**

- Create: `apps/extension/src/datetime.ts`
- Create: `apps/extension/src/datetime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/extension/src/datetime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromLocalInput, toLocalInput } from './datetime.js';

describe('datetime input helpers', () => {
  it('toLocalInput produces a YYYY-MM-DDTHH:MM string', () => {
    expect(toLocalInput('2026-06-04T08:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('round-trips an ISO timestamp to minute precision', () => {
    const iso = '2026-06-04T08:30:00.000Z';
    const back = fromLocalInput(toLocalInput(iso));
    expect(Math.abs(new Date(back).getTime() - new Date(iso).getTime())).toBeLessThan(60_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter ./apps/extension exec vitest run src/datetime.test.ts`
Expected: FAIL — cannot resolve `./datetime.js`.

- [ ] **Step 3: Implement `datetime.ts`**

Create `apps/extension/src/datetime.ts`:

```ts
/** Helpers to bridge ISO timestamps and the browser-local value of
 *  <input type="datetime-local"> (format: YYYY-MM-DDTHH:MM, local zone). */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string {
  // `new Date('YYYY-MM-DDTHH:MM')` is parsed in the browser's local zone.
  return new Date(local).toISOString();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter ./apps/extension exec vitest run src/datetime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/datetime.ts apps/extension/src/datetime.test.ts
git commit -m "feat(extension): datetime-local <-> ISO helpers"
```

---

## Task 10: Extension sync — `executeUpdate`, `executeCreateManual`, `executeCreateProject` + replay

**Files:**

- Modify: `apps/extension/src/sync.ts`

- [ ] **Step 1: Extend the imports**

In `apps/extension/src/sync.ts`, replace the `./api.js` import block (`:14-22`) with:

```ts
import {
  ApiError,
  createManualEntry,
  createProject,
  deleteEntry,
  playAgain,
  startTimer,
  stopTimer,
  updateEntry,
  type ApiSession,
  type ManualEntryApiInput,
  type StartTimerInput,
  type UpdateEntryPatch,
} from './api.js';
```

- [ ] **Step 2: Extend the `SyncState` interface**

Add to the `SyncState` interface (after `executeDelete`):

```ts
executeUpdate: (entryId: string, patch: UpdateEntryPatch) => Promise<void>;
executeCreateManual: (input: ManualEntryApiInput) => Promise<void>;
/** Online-only (admin setup action). Returns the new project or throws on failure. */
executeCreateProject: (clientId: string, name: string) => Promise<{ id: string }>;
```

- [ ] **Step 3: Implement the three callbacks**

In `useExtensionSync`, after `executeDelete` (before the `return { ... }`), add:

```ts
const executeUpdate = useCallback(
  async (entryId: string, patch: UpdateEntryPatch): Promise<void> => {
    if (!session) return;
    try {
      await updateEntry(session, entryId, patch);
      nudgeServiceWorker();
      await refreshRef.current();
    } catch (err) {
      if (isNetworkError(err)) {
        await queue.enqueue({
          kind: 'updateEntry',
          payload: { id: entryId, patch },
          clientId: crypto.randomUUID(),
        });
        setPending(await queue.size());
        await refreshRef.current();
      } else {
        throw err;
      }
    }
  },
  [session],
);

const executeCreateManual = useCallback(
  async (input: ManualEntryApiInput): Promise<void> => {
    if (!session) return;
    try {
      await createManualEntry(session, companyId, input);
      nudgeServiceWorker();
      await refreshRef.current();
    } catch (err) {
      if (isNetworkError(err)) {
        await queue.enqueue({
          kind: 'createManual',
          payload: { ...input, companyId },
          clientId: crypto.randomUUID(),
        });
        setPending(await queue.size());
        await refreshRef.current();
      } else {
        throw err;
      }
    }
  },
  [session, companyId],
);

const executeCreateProject = useCallback(
  async (clientId: string, name: string): Promise<{ id: string }> => {
    if (!session) throw new ApiError(401, 'no_session');
    const created = await createProject(session, { clientId, name });
    await refreshRef.current();
    return created;
  },
  [session],
);
```

Update the `return` statement to include them:

```ts
return {
  online,
  pending,
  conflicts,
  executeStart,
  executeStop,
  executePlayAgain,
  executeDelete,
  executeUpdate,
  executeCreateManual,
  executeCreateProject,
};
```

- [ ] **Step 4: Implement the replay cases**

Replace the dropped `createManual`/`updateEntry` cases in `replayMutation` (`:290-293`):

```ts
    case 'createManual': {
      const p = m.payload as ManualEntryApiInput & { companyId?: string | null };
      await createManualEntry(session, (p.companyId as string | null) ?? null, p);
      return;
    }
    case 'updateEntry': {
      const p = m.payload as { id: string; patch: UpdateEntryPatch };
      await updateEntry(session, p.id, p.patch);
      return;
    }
```

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/sync.ts
git commit -m "feat(extension): wire update/manual/create-project mutations + offline replay"
```

---

## Task 11: Extension UI — `EntrySheet` overlay + edit/manual/create-project wiring

Build the shared overlay sheet and wire it: click any running/history row to edit (AIAGE-26), a "+ Přidat ručně" button to create (AIAGE-34), and an admin-only "+ Nový projekt" inside the project picker (AIAGE-30).

**Files:**

- Create: `apps/extension/src/EntrySheet.tsx`
- Modify: `apps/extension/src/popup.tsx`

- [ ] **Step 1: Create the `EntrySheet` component**

Create `apps/extension/src/EntrySheet.tsx`:

```tsx
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import type { CatalogResponse, ManualEntryApiInput, UpdateEntryPatch } from './api.js';
import { fromLocalInput, toLocalInput } from './datetime.js';

export interface EntrySheetInitial {
  id: string;
  description: string;
  clientId: string | null;
  projectId: string | null;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, or null while running
  tagIds: string[];
}

export interface EntrySheetProps {
  mode: 'edit' | 'create';
  catalog: CatalogResponse;
  isAdmin: boolean;
  nowIso: string;
  initial?: EntrySheetInitial;
  onClose: () => void;
  onSave: (entryId: string, patch: UpdateEntryPatch) => Promise<void>;
  onCreate: (input: ManualEntryApiInput) => Promise<void>;
  onCreateProject: (clientId: string, name: string) => Promise<{ id: string }>;
}

export function EntrySheet(props: EntrySheetProps): ReactElement {
  const { mode, catalog, isAdmin, initial } = props;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [start, setStart] = useState(toLocalInput(initial?.startedAt ?? props.nowIso));
  const [end, setEnd] = useState(initial?.endedAt ? toLocalInput(initial.endedAt) : '');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasRunning = mode === 'edit' && initial?.endedAt == null;
  const projects = useMemo(
    () => catalog.clients.find((c) => c.id === clientId)?.projects ?? [],
    [catalog.clients, clientId],
  );

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function addProject(): Promise<void> {
    const name = newProjectName.trim();
    if (!clientId || !name) return;
    try {
      const created = await props.onCreateProject(clientId, name);
      setProjectId(created.id);
      setCreatingProject(false);
      setNewProjectName('');
    } catch {
      setError('Projekt se nepodařilo vytvořit');
    }
  }

  async function submit(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      if (mode === 'create') {
        if (!end) {
          setError('Vyplňte konec');
          setPending(false);
          return;
        }
        await props.onCreate({
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: fromLocalInput(start),
          endedAt: fromLocalInput(end),
          tagIds,
        });
      } else if (initial) {
        const patch: UpdateEntryPatch = {
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: fromLocalInput(start),
          tagIds,
        };
        // Only touch endedAt if it's a completed entry or the user filled an end.
        if (!wasRunning || end) patch.endedAt = end ? fromLocalInput(end) : null;
        await props.onSave(initial.id, patch);
      }
      props.onClose();
    } catch {
      setError('Uložení se nezdařilo');
      setPending(false);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-700/60">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {mode === 'create' ? 'Nový záznam' : 'Upravit záznam'}
        </span>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Zavřít"
          className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto p-3">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Co děláte?"
          className="block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId('');
              setCreatingProject(false);
            }}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">— klient —</option>
            {catalog.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!clientId}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            <option value="">— projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && clientId ? (
          creatingProject ? (
            <div className="flex gap-1">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Název projektu"
                className="block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => void addProject()}
                className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Přidat
              </button>
              <button
                type="button"
                onClick={() => setCreatingProject(false)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              + Nový projekt
            </button>
          )
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Začátek
            </span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Konec
            </span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        </div>
        {catalog.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {catalog.tags.map((t) => {
              const active = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={
                    active
                      ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                      : { borderColor: '#52525b', color: '#a1a1aa' }
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          {pending ? 'Ukládám…' : 'Uložit'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Import the sheet and add AppShell state/handlers in `popup.tsx`**

Add to the imports:

```ts
import { EntrySheet, type EntrySheetInitial } from './EntrySheet.js';
```

In `AppShell`, after the `useExtensionSync` call (`:406-411`), add:

```ts
const [sheet, setSheet] = useState<{ mode: 'edit' | 'create'; initial?: EntrySheetInitial } | null>(
  null,
);
const isAdmin = useMemo(
  () => state.me.memberships.find((m) => m.companyId === state.timer.companyId)?.role === 'admin',
  [state.me.memberships, state.timer.companyId],
);

function openEdit(id: string): void {
  const all = [...(state.timer.running ?? []), ...(state.timer.history ?? [])];
  const e = all.find((x) => x.id === id);
  if (!e) return;
  setSheet({
    mode: 'edit',
    initial: {
      id: e.id,
      description: e.description,
      clientId: e.clientId,
      projectId: e.projectId,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      tagIds: e.tags.map((t) => t.id),
    },
  });
}
```

- [ ] **Step 3: Render the sheet + manual-entry trigger; make the root relative**

Change the `AppShell` root `<div>` (`:414`) to add `relative`:

```tsx
    <div className="relative w-[380px] divide-y divide-zinc-100 text-sm dark:divide-zinc-700/60">
```

Replace the `StartRow`/`RunningList`/`HistoryList` block (`:429-436`) with:

```tsx
      <StartRow catalog={state.catalog} onStart={sync.executeStart} />
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setSheet({ mode: 'create' })}
          className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
        >
          + Přidat ručně
        </button>
      </div>
      <RunningList
        entries={state.timer.running}
        now={now}
        onStop={sync.executeStop}
        onEdit={openEdit}
      />
      {showStats ? <SummaryCards summary={state.timer.summary} /> : null}
      <HistoryList
        entries={state.timer.history ?? []}
        onPlayAgain={sync.executePlayAgain}
        onDelete={sync.executeDelete}
        onEdit={openEdit}
      />
      {sheet ? (
        <EntrySheet
          mode={sheet.mode}
          catalog={state.catalog}
          isAdmin={isAdmin}
          nowIso={new Date(now).toISOString()}
          initial={sheet.initial}
          onClose={() => setSheet(null)}
          onSave={sync.executeUpdate}
          onCreate={sync.executeCreateManual}
          onCreateProject={sync.executeCreateProject}
        />
      ) : null}
```

- [ ] **Step 4: Add `onEdit` to `RunningList` (and keep the bigger Stop button from Task 3)**

Update the `RunningList` signature (`:852-866`) to accept `onEdit`:

```tsx
function RunningList({
  entries,
  now,
  onStop,
  onEdit,
}: {
  entries: {
    id: string;
    description: string;
    startedAt: string;
    clientName: string | null;
    projectName: string | null;
  }[];
  now: number;
  onStop: (entryId: string) => Promise<void>;
  onEdit: (entryId: string) => void;
}): ReactElement | null {
```

Make the left text block a clickable edit button — replace the `<div className="min-w-0">…</div>` block (`:878-887`) with:

```tsx
<button type="button" onClick={() => onEdit(e.id)} className="min-w-0 flex-1 text-left">
  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
    {e.description || <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>}
  </div>
  <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
    {[e.clientName, e.projectName].filter(Boolean).join(' · ') || '—'}
  </div>
</button>
```

- [ ] **Step 5: Add `onEdit` to `HistoryList`**

Update the `HistoryList` signature (`:906-914`) to accept `onEdit`:

```tsx
function HistoryList({
  entries,
  onPlayAgain,
  onDelete,
  onEdit,
}: {
  entries: RecentEntryInput[];
  onPlayAgain: (entryId: string) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onEdit: (entryId: string) => void;
}): ReactElement {
```

Make each history row's text block clickable — replace the `<div className="min-w-0">…</div>` inside the row (`:974-983`) with:

```tsx
<button type="button" onClick={() => onEdit(e.id)} className="min-w-0 flex-1 text-left">
  <div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
    {e.description || <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>}
  </div>
  <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
    {[e.clientName, e.projectName].filter(Boolean).join(' · ') || '—'}
  </div>
</button>
```

- [ ] **Step 6: Typecheck, test, build**

Run: `pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension test && pnpm --filter ./apps/extension build`
Expected: PASS. (If typecheck flags that `RecentEntryInput` lacks fields used by `openEdit`, note `openEdit` reads from `state.timer.history` (typed `EntryDto[]`), not the narrowed prop — no change needed.)

- [ ] **Step 7: Manual verification**

Load `apps/extension/dist` unpacked. Verify: (a) clicking a running or history row opens the sheet pre-filled; editing name/project/client/start/end and saving updates the entry; (b) "+ Přidat ručně" opens an empty sheet, requires an end, and creates a completed entry; (c) as an admin, "+ Nový projekt" appears once a client is selected, creates the project, and selects it; as a non-admin it does not appear.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/EntrySheet.tsx apps/extension/src/popup.tsx
git commit -m "feat(extension): edit entries, manual entry, and admin project creation (AIAGE-26/30/34)"
```

---

## Final verification

- [ ] **Web:** `pnpm --filter ./apps/web typecheck && pnpm --filter ./apps/web test` (Docker running for testcontainers).
- [ ] **Extension:** `pnpm --filter ./apps/extension typecheck && pnpm --filter ./apps/extension test && pnpm --filter ./apps/extension build`.
- [ ] **Lint:** `pnpm lint`.
- [ ] **US coverage:** `pnpm test:trace` stays at 100% (route tests reference existing US-14/19/20/24/28; no new US introduced).
- [ ] **Docs:** update `docs/architecture/` to note the three new v1 endpoints and the extension edit/manual/create-project features; if the createProject audit change is notable, no ADR is required (tech stack unchanged).

## Notes & assumptions

- **Audit source:** new mutation routes call the services without an explicit `AuditSource`, so rows default to `web` (matching the existing v1 `timer` route). If/when an extension-specific `AuditSource` enum value exists, pass it through.
- **createProject permissions:** the service's `requireAdmin` returns `not_found`, so the route returns **404** (not 403) for non-admins — existence-safe and consistent with the constitution. The extension hides the affordance from non-admins using `me.memberships[].role`, so 404 is only a defense-in-depth backstop.
- **Project creation is online-only** in the extension (admin setup action; not added to the offline queue). Edit and manual entry ARE offline-queued (the queue already declares `updateEntry`/`createManual`).
- **No extension component-test harness** exists (extension unit tests cover pure logic only). `EntrySheet` behavior is covered by its pure helpers (`format`, `datetime`) plus typecheck/build and the manual checklist; an extension Playwright e2e for the sheet is a reasonable follow-up but is out of scope here.
