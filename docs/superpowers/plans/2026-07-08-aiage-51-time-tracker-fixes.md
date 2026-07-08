# AIAGE-51 Time Tracker Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four reported Time Tracker defects (extension running timer lost its seconds; deleted entries are unrecoverable by their owner and unidentifiable; extension sheets open scrolled past their own header; the `/reports` client filter is clipped to ~4 rows with no scrollbar) plus four adjacent bugs found while investigating them.

**Architecture:** Nothing here needs new data capture — the database already holds everything the user asked to see. Eight of the ten commits render, scope, or position data that already exists. Only "purge permanently" adds schema (one enum value). Work proceeds outside-in: stand up the missing extension test harness first, then land each fix behind a test that fails for the right reason.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess`; Next.js 15 App Router / React 19; Prisma 6 / Postgres 16; Vitest + testcontainers (real Postgres + Redis, zero DB mocks); Playwright; Vite + MV3 for the extension; Tailwind; `next-intl` (`cs` only).

**Spec:** [`../specs/2026-07-08-aiage-51-time-tracker-fixes-design.md`](../specs/2026-07-08-aiage-51-time-tracker-fixes-design.md)

## Global Constraints

Every task's requirements implicitly include this section. These come from [`docs/constitution.md`](../../constitution.md).

- **Test-first.** The test must fail for the right reason before you make it pass.
- **One user story per `it`/`test` block**, with the US ID embedded in the name: `it('US-91: …')`.
- **Real Postgres + Redis via testcontainers.** Zero DB mocks, ever. Service tests use `withTx` from `@tt/db/test`.
- **Cross-company 404 is mandatory** for every read endpoint and every mutation. Use `not_found` (never `403`) to avoid existence leaks.
- **Every mutation produces exactly one audit row.**
- **Audit rows are immutable.** No service may call `auditLog.update`, `auditLog.delete`, `auditLog.deleteMany`, or `auditLog.updateMany`. `apps/web/tests/services/audit.test.ts:149-181` greps `src/lib/services/` and `src/server/mcp/` for these.
- **No `.only`, `.skip`, `xit`, `xdescribe`** — the pre-commit hook blocks them. **No `console.log`** in `apps/` or `packages/`.
- **No `setTimeout` for synchronisation in tests.** Use `expect.poll`, `waitFor`, or fake timers. In Playwright, never `page.waitForTimeout`.
- **Czech UI only.** Copy in `apps/web/src/app/(authenticated)/timer/` goes through `next-intl` keys in `apps/web/messages/cs.json`. Copy in `trash/TrashList.tsx` and `audit/page.tsx` is currently inline Czech — match the file you are editing rather than converting it.
- **Conventional commits**, one logical change per commit. Reference US IDs in the body.
- **`pnpm test:trace` must report 100 % US coverage.** It walks every test file for `\bUS-N\b` and fails if any of `US-1..TOTAL_US` has zero matches.

**Two facts that contradict the docs — trust the code:**

- Czech messages live in `apps/web/messages/cs.json`, **not** `apps/web/src/i18n.ts` (the constitution says otherwise; `i18n.ts` merely imports the JSON).
- Route-handler tests live in `apps/web/tests/services/*-route.test.ts`, not `tests/api/`.

## File Structure

**Created:**

| Path                                                      | Responsibility                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/extension/playwright.config.ts`                     | Extension e2e config — builds the bundle, serves `dist/popup.html` via `vite preview`      |
| `apps/extension/tests/e2e/fixtures.ts`                    | `chrome.*` stub + API route stubs + seed data. The only place e2e knows about storage keys |
| `apps/extension/tests/e2e/popup.spec.ts`                  | Extension popup e2e — smoke, US-90, US-97                                                  |
| `apps/extension/src/useBodyScrollLock.ts`                 | Locks `<body>` scroll while a sheet is mounted. Shared by both sheets.                     |
| `packages/shared/src/time/duration.ts`                    | Pure duration arithmetic. **Zero imports.**                                                |
| `packages/shared/src/time/duration.test.ts`               | Unit tests for the above                                                                   |
| `apps/web/tests/services/trash.test.ts`                   | US-91, US-92, US-93, US-95, US-96 service tests                                            |
| `apps/web/tests/services/cron-purge-route.test.ts`        | US-96 route auth tests                                                                     |
| `apps/web/tests/e2e/trash-undo.spec.ts`                   | US-94                                                                                      |
| `apps/web/tests/e2e/reports-multiselect.spec.ts`          | US-98                                                                                      |
| `apps/web/src/app/api/cron/purge/route.ts`                | `POST` purge endpoint, `CRON_SECRET`-guarded                                               |
| `docs/decisions/0011-coolify-scheduled-task-for-purge.md` | ADR                                                                                        |

**Modified:**

| Path                                                                                             | Change                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/package.json`                                                                   | Add `"./time/duration"` export                                                                                         |
| `packages/shared/src/time/index.ts`                                                              | Move 3 fns out, re-export them                                                                                         |
| `apps/extension/src/popup.tsx`                                                                   | Tick gating, `RUNNING_TICK_MS`, seconds on the running row, freeze `nowIso` at sheet open                              |
| `apps/extension/src/format.ts`                                                                   | Correct the stale AIAGE-28 comment                                                                                     |
| `apps/extension/src/EntrySheet.tsx`                                                              | `fixed inset-0`, real inner scroller, body scroll lock                                                                 |
| `apps/extension/src/NewProjectSheet.tsx`                                                         | Same                                                                                                                   |
| `apps/extension/package.json`                                                                    | Version → `1.6.0`                                                                                                      |
| `apps/web/src/components/MultiSelect.tsx`                                                        | Portal the popover; second ref for click-outside                                                                       |
| `apps/web/src/lib/services/time-entries.ts`                                                      | `snapshotOf` extraction; `restoreEntry` authz; `listTrash` scope + payload; new `purgeEntry`; `purgeOldDeleted` audits |
| `apps/web/src/lib/actions/time.ts`                                                               | `restoreEntryAction` also revalidates `/timer`; new `purgeEntryAction`                                                 |
| `apps/web/src/app/(authenticated)/trash/page.tsx`                                                | Use the service; drop `requireAdmin`                                                                                   |
| `apps/web/src/app/(authenticated)/trash/TrashList.tsx`                                           | Start/end/duration columns; admin-only purge                                                                           |
| `apps/web/src/app/(authenticated)/timer/TimerLists.tsx`                                          | Undo Alert                                                                                                             |
| `apps/web/src/app/(authenticated)/nav.ts`                                                        | Un-gate `/trash`                                                                                                       |
| `apps/web/src/app/(authenticated)/nav.test.ts`                                                   | Update expectations                                                                                                    |
| `apps/web/src/app/(authenticated)/audit/page.tsx`                                                | Export `ALL_ACTIONS`; derive from the enum                                                                             |
| `apps/web/messages/cs.json`                                                                      | `timer.undo.*`, `audit.action.shift`, `audit.action.purge`                                                             |
| `packages/db/prisma/schema.prisma`                                                               | `AuditAction` gains `purge`                                                                                            |
| `apps/web/package.json`                                                                          | Drop `node-cron`, `@types/node-cron`                                                                                   |
| `scripts/test-trace.ts`                                                                          | `TOTAL_US = 99`                                                                                                        |
| `docs/reference/{features,data-model,env-vars,acceptance}.md`, `docs/gotchas.md`, `.env.example` | Docs                                                                                                                   |

---

### Task 1: Extension Playwright e2e harness

`apps/extension` has no component-test harness — vitest only, over pure-logic files, and a `test:e2e` script (`apps/extension/package.json:14`) with no config behind it. Tasks 3 and 4 are UI changes that unit tests cannot verify. This task builds the harness and proves it with a smoke test.

The harness serves the **built** bundle (`vite build` → `vite preview`), not the dev server, because Task 3 makes the extension resolve a workspace package (`@tt/shared`) for the very first time — a build-time regression must surface here.

**Files:**

- Create: `apps/extension/playwright.config.ts`
- Create: `apps/extension/tests/e2e/fixtures.ts`
- Create: `apps/extension/tests/e2e/popup.spec.ts`
- Modify: `apps/extension/package.json` (devDependency + `test:e2e` already present)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `seedStorage(overrides?: Partial<SeedState>): Record<string, unknown>` — the `chrome.storage.local` seed map.
  - `installChromeStub(page: Page, seed: Record<string, unknown>): Promise<void>`
  - `installApiStubs(page: Page, api: ApiFixture): Promise<void>`
  - `type ApiFixture = { me: MeResponse; catalog: CatalogResponse; timer: TimerResponse }`
  - `buildApiFixture(opts?: { runningStartedAt?: string; historyCount?: number }): ApiFixture`
  - `POPUP_URL: string`, `VIEWPORT: { width: 380; height: 600 }`

**Key facts (verified, do not re-derive):**

- Storage keys are `tt:session`, `tt:api-base`, `tt:popup-cache` (`apps/extension/src/api.ts:119-121`).
- `ApiSession` is `{ token, expiresAt, apiBase }` (`api.ts:113`).
- `sync.ts:158` short-circuits with `if (!session || !wsUrl) return;` — set `me.wsUrl = null` and **no WebSocket is opened**.
- `chrome.*` surface used by the popup: `storage.local.{get,set,remove}`, `storage.onChanged.{addListener,removeListener}`, `tabs.create`, `runtime.sendMessage`.
- Set `apiBase` to the preview origin so API calls are **same-origin** — otherwise a `page.route`-fulfilled cross-origin response is still blocked by CORS.

- [ ] **Step 1: Add the Playwright config**

Create `apps/extension/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    viewport: { width: 380, height: 600 },
  },
  // Serve the BUILT bundle: this is what catches a workspace-package
  // resolution regression when Task 3 imports @tt/shared.
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `${BASE_URL}/popup.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write the fixtures module**

Create `apps/extension/tests/e2e/fixtures.ts`:

```ts
import type { Page } from '@playwright/test';
import type { CatalogResponse, MeResponse, TimerResponse } from '../../src/api.js';

export const PORT = 5199;
export const ORIGIN = `http://localhost:${PORT}`;
export const POPUP_URL = `${ORIGIN}/popup.html`;
export const VIEWPORT = { width: 380, height: 600 } as const;

const COMPANY_ID = 'cmp-e2e';

export interface SeedState {
  token: string;
  expiresAt: string;
}

/** chrome.storage.local seed. apiBase === ORIGIN keeps API calls same-origin. */
export function seedStorage(overrides: Partial<SeedState> = {}): Record<string, unknown> {
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
  return {
    'tt:session': { token: overrides.token ?? 'e2e-token', expiresAt, apiBase: ORIGIN },
    'tt:api-base': ORIGIN,
  };
}

export async function installChromeStub(page: Page, seed: Record<string, unknown>): Promise<void> {
  await page.addInitScript((initial: Record<string, unknown>) => {
    const store: Record<string, unknown> = { ...initial };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = {
      storage: {
        local: {
          get: (key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}),
          set: (obj: Record<string, unknown>) => {
            Object.assign(store, obj);
            return Promise.resolve();
          },
          remove: (key: string) => {
            delete store[key];
            return Promise.resolve();
          },
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
      tabs: { create: () => {} },
      runtime: { sendMessage: () => Promise.resolve() },
    };
  }, seed);
}

export interface ApiFixture {
  me: MeResponse;
  catalog: CatalogResponse;
  timer: TimerResponse;
}

/**
 * `runningStartedAt` defaults to 1h 1m 1s ago so the running row renders
 * `01:01:01` once seconds are restored (US-90).
 * `historyCount` defaults to 25 — enough rows to make the 600px-tall popup
 * scroll, which US-97 depends on.
 */
export function buildApiFixture(
  opts: { runningStartedAt?: string; historyCount?: number } = {},
): ApiFixture {
  const now = Date.now();
  const runningStartedAt = opts.runningStartedAt ?? new Date(now - 3_661_000).toISOString();
  const historyCount = opts.historyCount ?? 25;

  const history = Array.from({ length: historyCount }, (_, i) => {
    const endedAt = new Date(now - (i + 1) * 3_600_000);
    const startedAt = new Date(endedAt.getTime() - 1_800_000);
    return {
      id: `hist-${i}`,
      description: `Historický záznam ${i}`,
      note: '',
      clientId: null,
      clientName: null,
      projectId: null,
      projectName: null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      tags: [],
    };
  });

  return {
    me: {
      userId: 'usr-e2e',
      email: 'e2e@example.test',
      fullName: 'E2E User',
      totpEnabled: false,
      theme: 'light',
      memberships: [{ companyId: COMPANY_ID, companyName: 'E2E Co', role: 'admin' }],
      // null => sync.ts:158 returns early, no WebSocket in tests.
      wsUrl: null,
      autoStackOverlaps: false,
    } as MeResponse,
    catalog: {
      companyId: COMPANY_ID,
      clients: [{ id: 'cli-1', name: 'Klient A', projects: [{ id: 'prj-1', name: 'Projekt A' }] }],
      tags: [],
    },
    timer: {
      companyId: COMPANY_ID,
      running: [
        {
          id: 'run-1',
          description: 'Běžící úkol',
          note: '',
          clientId: null,
          clientName: null,
          projectId: null,
          projectName: null,
          startedAt: runningStartedAt,
          endedAt: null,
          tags: [],
        },
      ],
      history,
      summary: { weekMs: 0, monthMs: 0, lastMonthMs: 0 },
    },
  };
}

export async function installApiStubs(page: Page, api: ApiFixture): Promise<void> {
  // ORDER MATTERS. Playwright runs matching route handlers in the *reverse*
  // order they were registered, so the last one registered wins. The catch-all
  // must therefore go FIRST, or it would swallow every specific route below.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 500, json: { error: 'unstubbed', url: route.request().url() } }),
  );
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: api.me }));
  await page.route('**/api/v1/catalog', (route) => route.fulfill({ json: api.catalog }));
  await page.route('**/api/v1/timer', (route) => route.fulfill({ json: api.timer }));
}

/** Boot the popup with stubs installed and wait for first paint. */
export async function openPopup(page: Page, api: ApiFixture = buildApiFixture()): Promise<void> {
  await installChromeStub(page, seedStorage());
  await installApiStubs(page, api);
  await page.goto(POPUP_URL);
}
```

- [ ] **Step 3: Write the smoke test**

Create `apps/extension/tests/e2e/popup.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { buildApiFixture, openPopup } from './fixtures.js';

test.describe('extension popup', () => {
  test('boots with a running timer and a scrollable history', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    await expect(page.getByText('Probíhá (1)')).toBeVisible();
    await expect(page.getByText('Běžící úkol')).toBeVisible();

    // 25 history rows in a 600px popup must overflow the viewport.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(600);
  });
});
```

- [ ] **Step 4: Install the Playwright dev dependency and run the harness**

`@playwright/test` is already in `apps/extension/package.json` devDependencies (`^1.49.1`), and the root `test:e2e:ext` script already exists. Install browsers if needed, then run:

```bash
pnpm --filter @tt/extension exec playwright install --with-deps chromium
pnpm test:e2e:ext
```

Expected: `1 passed`. If `vite preview` cannot resolve `popup.html`, confirm `apps/extension/dist/popup.html` exists after `pnpm --filter @tt/extension build`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/playwright.config.ts apps/extension/tests/
git commit -m "test(ext): Playwright e2e harness for the popup

The extension had no component-test harness at all — vitest over pure-logic
files only, and a test:e2e script with no config behind it. Serves the built
bundle via vite preview so a workspace-package resolution regression surfaces
here. Stubs chrome.* and the v1 API; me.wsUrl=null keeps sync.ts from opening
a WebSocket."
```

---

### Task 2: Extract pure duration formatters into a leaf module

`packages/shared/src/time/index.ts` imports `date-fns-tz` at module scope. `pad2`, `formatDurationHMS` and `durationMs` (`:80-92`) are pure arithmetic that merely happens to live beside it. Task 3 needs `formatDurationHMS` inside an MV3 popup bundle; importing the barrel would drag in `zod` (via `validators`) and the WS client too.

This is a pure refactor. No behaviour changes; the barrel keeps exporting all three names.

**Files:**

- Create: `packages/shared/src/time/duration.ts`
- Create: `packages/shared/src/time/duration.test.ts`
- Modify: `packages/shared/src/time/index.ts:80-92`
- Modify: `packages/shared/package.json` (`exports`)
- Modify: `packages/shared/src/time/time.test.ts:27-31` (move the `formatDurationHMS` case out)

**Interfaces:**

- Consumes: nothing.
- Produces, from `@tt/shared/time/duration` (and re-exported by `@tt/shared/time` and `@tt/shared`):
  - `pad2(n: number): string`
  - `formatDurationHMS(ms: number): string`
  - `durationMs(start: Date, end: Date | null): number` — **stays in `index.ts`**, it calls `now()`.

Note: only `pad2` and `formatDurationHMS` move. `durationMs` depends on the overridable clock (`now()`), which lives in `index.ts`; moving it would drag the clock into the leaf.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/time/duration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDurationHMS, pad2 } from './duration.js';

describe('pad2', () => {
  it('left-pads single digits to two characters', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(7)).toBe('07');
    expect(pad2(42)).toBe('42');
  });
});

describe('formatDurationHMS', () => {
  it('formats hours, minutes and seconds with zero padding', () => {
    expect(formatDurationHMS(0)).toBe('00:00:00');
    expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
    expect(formatDurationHMS(59_999)).toBe('00:00:59');
  });

  it('clamps negatives to zero', () => {
    expect(formatDurationHMS(-5)).toBe('00:00:00');
  });

  it('does not wrap past 24 hours', () => {
    expect(formatDurationHMS(25 * 3_600_000)).toBe('25:00:00');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @tt/shared exec vitest run src/time/duration.test.ts
```

Expected: FAIL — `Failed to resolve import "./duration.js"`.

- [ ] **Step 3: Create the leaf module**

Create `packages/shared/src/time/duration.ts`:

```ts
/**
 * Pure duration arithmetic. **This module must have zero imports.**
 *
 * It is imported directly by the Chrome extension popup
 * (`@tt/shared/time/duration`), which must not pull in `date-fns-tz` (via
 * `./index.js`), `zod` (via `../validators/`), or the WS client (via `../ws/`).
 * Keep it dependency-free.
 */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatDurationHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
```

- [ ] **Step 4: Re-export from the barrel and delete the originals**

In `packages/shared/src/time/index.ts`, delete these lines (currently at `:84-92`):

```ts
export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatDurationHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
```

and add this line at the **top** of the file, immediately after the existing `import` statements:

```ts
export { pad2, formatDurationHMS } from './duration.js';
```

A bare re-export is sufficient: `pad2`'s only caller inside `index.ts` was `formatDurationHMS` (`:91`), and both move together. Do **not** add an `import { pad2 }` — nothing else in the file references it.

Leave `durationMs` exactly where it is — it calls `now()`.

- [ ] **Step 5: Add the subpath export**

In `packages/shared/package.json`, extend `exports`:

```json
  "exports": {
    ".": "./src/index.ts",
    "./time": "./src/time/index.ts",
    "./time/duration": "./src/time/duration.ts",
    "./validators": "./src/validators/index.ts",
    "./ws": "./src/ws/index.ts"
  },
```

- [ ] **Step 6: Move the old assertion out of `time.test.ts`**

In `packages/shared/src/time/time.test.ts`, delete this block (`:27-31`):

```ts
it('formats durations as HH:MM:SS', () => {
  expect(formatDurationHMS(0)).toBe('00:00:00');
  expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
  expect(formatDurationHMS(-5)).toBe('00:00:00');
});
```

and replace it with a barrel-integrity assertion, so a future refactor cannot silently drop the re-export:

```ts
it('re-exports the pure duration formatters from the barrel', () => {
  expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
});
```

Leave the `formatDurationHMS` import in `time.test.ts:6` in place — it now exercises the re-export.

- [ ] **Step 7: Run the tests**

```bash
pnpm --filter @tt/shared test
pnpm typecheck
```

Expected: PASS. `formatDurationHMS` resolves both from `./duration.js` (new test) and from `./index.js` (existing test).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "refactor(shared): extract pure duration formatters into a leaf module

pad2 and formatDurationHMS are pure arithmetic co-located with date-fns-tz
code. The Chrome extension popup needs formatDurationHMS but must not pull in
date-fns-tz, zod (via validators) or the WS client (via ws). Move them to a
zero-import leaf and re-export from the barrel so nothing breaks."
```

---

### Task 3: Extension running timer shows seconds again (US-90)

A scoped partial revert of AIAGE-28, which removed seconds from the extension **everywhere** and widened the tick from 1000 ms to 30 000 ms.

Three changes ride together because they are one behaviour:

1. The running row uses `formatDurationHMS`.
2. The tick drops to 1000 ms **and becomes conditional on a timer running** (today it fires unconditionally at `popup.tsx:357-361`).
3. **`nowIso` is captured when a sheet opens.** This is not optional. `AppShell` currently passes `nowIso={new Date(now).toISOString()}` to `EntrySheet` (`popup.tsx:474`), and `EntrySheet.tsx:62-63` uses it as the `useState` initialiser for the manual-entry start time. Gating the tick freezes `now` at popup-mount time whenever no timer runs — so opening "Přidat ručně" ten minutes later would prefill a ten-minute-stale start. The unconditional 30 s tick masks this today.

`EntrySheet`'s "Odpracováno" (`EntrySheet.tsx:283`) **stays on `fmtDurationHM`**: it computes `workedMs` once per render with no tick of its own, so a frozen `00:12:37` reads as more wrong than `00:12`.

**Files:**

- Modify: `apps/extension/src/popup.tsx` (imports, `AppShell` tick, sheet state, `RunningList`)
- Modify: `apps/extension/src/format.ts:1` (stale comment)
- Modify: `apps/extension/tests/e2e/popup.spec.ts` (add US-90)

**Interfaces:**

- Consumes: `formatDurationHMS` from `@tt/shared/time/duration` (Task 2); `openPopup`, `buildApiFixture` from `./fixtures.js` (Task 1).
- Produces: `export const RUNNING_TICK_MS = 1000` from `apps/extension/src/popup.tsx`; `data-testid="running-duration"` on the running row's duration `<span>`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/extension/tests/e2e/popup.spec.ts`, inside the existing `test.describe('extension popup', …)`:

```ts
test('US-90: the running row shows seconds and ticks every second', async ({ page }) => {
  await openPopup(page, buildApiFixture());

  const duration = page.getByTestId('running-duration');
  await expect(duration).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(duration).toHaveText(/^01:01:0\d$/);

  // Poll rather than sleep — the constitution bans setTimeout for sync.
  const first = await duration.textContent();
  await expect.poll(async () => duration.textContent(), { timeout: 5_000 }).not.toBe(first);
});

test('US-90: stopped history rows keep HH:MM, without seconds', async ({ page }) => {
  await openPopup(page, buildApiFixture());

  // Each seeded history entry is exactly 30 minutes long.
  await expect(page.getByText('00:30', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('00:30:00', { exact: true })).toHaveCount(0);
});

test('US-90: a 1s tick does not clobber the manual-entry start input', async ({ page }) => {
  // Regression guard for bce7cbb (web: "manual start input was uneditable").
  await openPopup(page, buildApiFixture());

  // "Přidat ručně" lives inside MoreMenu (popup.tsx:690), behind the ⋯
  // toggle whose accessible name comes from its title attribute.
  await page.getByTitle('Více').click();
  await page.getByRole('menuitem', { name: 'Přidat ručně' }).click();

  const startTime = page.locator('input[type="time"]').first();
  await startTime.fill('08:15');

  // Wait for at least one tick by observing the running duration change.
  const duration = page.getByTestId('running-duration');
  const first = await duration.textContent();
  await expect.poll(async () => duration.textContent(), { timeout: 5_000 }).not.toBe(first);

  await expect(startTime).toHaveValue('08:15');
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm test:e2e:ext
```

Expected: the first two FAIL. `US-90: the running row shows seconds` fails on the missing `data-testid` (`getByTestId('running-duration')` resolves to 0 elements). The `stopped history rows` test passes already — that is correct; it is a **guard** proving Task 3 does not over-apply the change.

- [ ] **Step 3: Swap the formatter on the running row**

In `apps/extension/src/popup.tsx`, change the import at `:27`:

```ts
import { fmtDurationHM } from './format.js';
```

to:

```ts
import { formatDurationHMS } from '@tt/shared/time/duration';
import { fmtDurationHM } from './format.js';
```

Then in `RunningList` (`popup.tsx:997-999`), replace:

```tsx
<span className="font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
  {fmtDurationHM(now - new Date(e.startedAt).getTime())}
</span>
```

with:

```tsx
<span
  data-testid="running-duration"
  className="font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
>
  {formatDurationHMS(now - new Date(e.startedAt).getTime())}
</span>
```

- [ ] **Step 4: Gate the tick and drop it to 1 s**

In `apps/extension/src/popup.tsx`, add near the top-level consts:

```ts
/** Running timers re-render once a second so the seconds field advances (US-90). */
export const RUNNING_TICK_MS = 1000;
```

Replace the `AppShell` tick (`popup.tsx:357-361`):

```tsx
const [now, setNow] = useState(Date.now());
useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 30_000);
  return () => clearInterval(t);
}, []);
```

with:

```tsx
const hasRunning = (state.timer.running?.length ?? 0) > 0;
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  if (!hasRunning) return;
  setNow(Date.now());
  const t = setInterval(() => setNow(Date.now()), RUNNING_TICK_MS);
  return () => clearInterval(t);
}, [hasRunning]);
```

- [ ] **Step 5: Capture `nowIso` when a sheet opens**

Still in `apps/extension/src/popup.tsx`. With the tick gated, `now` no longer advances while idle, so the sheet must not read it.

Change the sheet state (`popup.tsx:409-412`):

```tsx
const [sheet, setSheet] = useState<{
  mode: 'edit' | 'create';
  initial?: EntrySheetInitial;
} | null>(null);
```

to:

```tsx
const [sheet, setSheet] = useState<{
  mode: 'edit' | 'create';
  /** Captured when the sheet opens — `now` is frozen while no timer runs. */
  nowIso: string;
  initial?: EntrySheetInitial;
} | null>(null);
```

In `openEdit` (`popup.tsx:423`), add the field:

```tsx
    setSheet({
      mode: 'edit',
      nowIso: new Date().toISOString(),
      initial: {
```

At the `Header` call site (`popup.tsx:449`), change:

```tsx
        onManualEntry={() => setSheet({ mode: 'create' })}
```

to:

```tsx
        onManualEntry={() => setSheet({ mode: 'create', nowIso: new Date().toISOString() })}
```

And at the `EntrySheet` render (`popup.tsx:474`), change:

```tsx
          nowIso={new Date(now).toISOString()}
```

to:

```tsx
          nowIso={sheet.nowIso}
```

- [ ] **Step 6: Correct the stale comment**

In `apps/extension/src/format.ts:1`, replace:

```ts
/** Duration as HH:MM (seconds intentionally omitted — see AIAGE-28). */
```

with:

```ts
/**
 * Duration as HH:MM — for *stopped* entries, day totals and summary cards
 * (AIAGE-28). The running row uses `formatDurationHMS` instead (AIAGE-51,
 * US-90), because a live timer without a seconds field looks frozen.
 */
```

- [ ] **Step 7: Verify — including the 380 px layout**

```bash
pnpm --filter @tt/extension test
pnpm test:e2e:ext
pnpm typecheck
```

Expected: all PASS. `HH:MM:SS` is three characters wider than `HH:MM` inside a 380 px popup where AIAGE-29 deliberately made STOP fill the row. The duration `<span>` already carries `font-mono tabular-nums`. Confirm the running row does not wrap:

```bash
pnpm --filter @tt/extension exec playwright test --headed
```

Look at the "Probíhá (1)" row. If it wraps, shrink the Stop button's `px-4` to `px-3` rather than dropping `tabular-nums`.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/popup.tsx apps/extension/src/format.ts apps/extension/tests/e2e/popup.spec.ts
git commit -m "fix(ext): running timer shows seconds again, ticks every second (US-90)

Partial revert of AIAGE-28, scoped to the running row. Stopped rows, day
totals and summary cards keep HH:MM.

The tick also becomes conditional on a running timer (it fired unconditionally
before). That freezes \`now\` while idle, so the sheet's nowIso is now captured
at open time — otherwise 'Přidat ručně' would prefill a stale start."
```

---

### Task 4: Extension sheets pin to the viewport (US-97)

`AppShell`'s root (`popup.tsx:439`) is `relative` and grows to the **full document height** — header + start row + running list + summary + the entire history. So `absolute inset-0` stretches a sheet from document `y=0` to the bottom of the whole list, not across the popup viewport. Scroll down, click a row, and the sheet's header and `Název` field render above the fold; the first thing visible is the `Popis` textarea.

`AutoStackSheet.tsx:79` already gets this right with `fixed inset-0`.

Two consequences of `absolute` on a document-tall parent, both fixed here:

- The inner `overflow-y-auto` (`EntrySheet.tsx:151`) has no height constraint, so it never scrolls — the document does.
- Nothing stops the history list from scrolling behind the open sheet.

**Files:**

- Create: `apps/extension/src/useBodyScrollLock.ts`
- Modify: `apps/extension/src/EntrySheet.tsx:137,151`
- Modify: `apps/extension/src/NewProjectSheet.tsx:36,48`
- Modify: `apps/extension/tests/e2e/popup.spec.ts` (add US-97)

**Interfaces:**

- Consumes: `openPopup`, `buildApiFixture` from `./fixtures.js` (Task 1).
- Produces: `useBodyScrollLock(): void` from `apps/extension/src/useBodyScrollLock.ts`.

- [ ] **Step 1: Write the failing test**

Append to `apps/extension/tests/e2e/popup.spec.ts`, inside the existing `test.describe`:

```ts
test('US-97: opening an entry while scrolled keeps the sheet header on screen', async ({
  page,
}) => {
  await openPopup(page, buildApiFixture({ historyCount: 25 }));

  // Scroll to the bottom of the popup document.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  // Open the last history row's edit sheet.
  await page.getByText('Historický záznam 24').click();

  const header = page.getByText('Upravit záznam');
  await expect(header).toBeVisible();

  const box = await header.boundingBox();
  if (!box) throw new Error('sheet header has no bounding box');

  // boundingBox() is relative to the viewport. With `absolute inset-0` on a
  // document-tall parent, the header sits at document y≈0, i.e. a negative
  // viewport y once scrolled.
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(600);

  // The title field must be visible too, not just the header.
  await expect(page.getByPlaceholder('Co děláte?')).toBeInViewport();
});

test('US-97: the body does not scroll behind an open sheet', async ({ page }) => {
  await openPopup(page, buildApiFixture({ historyCount: 25 }));
  await page.getByText('Historický záznam 0').click();
  await expect(page.getByText('Upravit záznam')).toBeVisible();

  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow).toBe('hidden');
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm test:e2e:ext
```

Expected: `US-97: opening an entry while scrolled…` FAILS with `expect(box.y).toBeGreaterThanOrEqual(0)` receiving a negative number (roughly `-scrollY`). `US-97: the body does not scroll…` FAILS with `expect('').toBe('hidden')`.

- [ ] **Step 3: Extract the body scroll lock into a shared hook**

Both sheets need the lock, so it lives in one place rather than being copied into each. Create `apps/extension/src/useBodyScrollLock.ts`:

```ts
import { useEffect } from 'react';

/**
 * Lock `<body>` scrolling for as long as the caller is mounted.
 *
 * The popup's root is document-tall, so an open sheet (`fixed inset-0`) covers
 * the viewport while the history list behind it is still scrollable. Locking
 * the body stops the list sliding around underneath.
 */
export function useBodyScrollLock(): void {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}
```

- [ ] **Step 4: Pin `EntrySheet` to the viewport**

In `apps/extension/src/EntrySheet.tsx`, add the hook to the local imports (beside `./format.js`):

```ts
import { useBodyScrollLock } from './useBodyScrollLock.js';
```

Call it immediately after the `const wasRunning = …` line (`:66`):

```ts
useBodyScrollLock();
```

Then change `:137`:

```tsx
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-zinc-900">
```

to:

```tsx
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-zinc-900">
```

and `:151`:

```tsx
      <div className="space-y-4 overflow-y-auto p-4">
```

to:

```tsx
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
```

`min-h-0` is required: a flex child's default `min-height: auto` refuses to shrink below its content, which would defeat `overflow-y-auto`.

- [ ] **Step 5: Pin `NewProjectSheet` the same way**

`NewProjectSheet.tsx:36` carries the identical latent bug. In `apps/extension/src/NewProjectSheet.tsx`, import the same hook and call it immediately before the `return (`:

```ts
import { useBodyScrollLock } from './useBodyScrollLock.js';
```

```ts
useBodyScrollLock();
```

Change `:36`:

```tsx
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-zinc-900">
```

to:

```tsx
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-zinc-900">
```

and `:48`:

```tsx
      <div className="space-y-4 overflow-y-auto p-4">
```

to:

```tsx
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
```

- [ ] **Step 6: Run the tests**

```bash
pnpm test:e2e:ext
pnpm typecheck
pnpm lint
```

Expected: PASS. Also confirm `AutoStackSheet` (`z-50`) still renders **above** an open `EntrySheet` (`z-40`) — the auto-stack sheet must win when a stop produces an overlap while a sheet is open.

`AutoStackSheet` is deliberately **not** converted to `useBodyScrollLock` in this task: it is already `fixed inset-0` and its scroll behaviour is out of scope. It is the hook's likely third caller later.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/useBodyScrollLock.ts apps/extension/src/EntrySheet.tsx apps/extension/src/NewProjectSheet.tsx apps/extension/tests/e2e/popup.spec.ts
git commit -m "fix(ext): entry + new-project sheets pin to the viewport (US-97)

AppShell's root is relative and document-tall, so \`absolute inset-0\` stretched
each sheet from document y=0 to the bottom of the whole history list. Scrolled
down, its header and Název field rendered above the fold.

Matches AutoStackSheet, which already used fixed inset-0. Also gives the inner
scroller a real height (min-h-0 flex-1) — it never actually scrolled before —
and locks body scroll while open."
```

---

### Task 5: MultiSelect popover escapes its clipping ancestors (US-98)

`MultiSelect`'s popover is `absolute` (`MultiSelect.tsx:145`). Two ancestors clip it:

- `packages/ui/src/card.tsx:9` — `Card` is `overflow-hidden` (the `/reports` filters)
- `packages/ui/src/confirm-modal.tsx:61` — `max-h-[90vh] overflow-y-auto` (the US-89 export dialog)

So the dropdown is cut at the Card's bottom edge and its own `max-h-[min(16rem,60vh)] overflow-y-auto` (`:164`) never gets to show a scrollbar. You see ~4 rows and cannot scroll.

Portalling to `document.body` with `position: fixed` clears both. Dropping `overflow-hidden` from `Card` is rejected — it is a shared primitive relying on the clip for rounded corners on tables, and it would not fix the modal at all, whose container _must_ scroll.

**Gotcha:** the click-outside handler at `:53` tests `containerRef.current.contains(e.target)`. A portalled popover is no longer a DOM descendant, so **every click on an option would close the popover**. A second ref is mandatory.

The trigger's four-chip cap (`:111`) with its `+N` badge (`:131`) is deliberate and is **not** the reported bug. Leave it.

**Files:**

- Modify: `apps/web/src/components/MultiSelect.tsx`
- Create: `apps/web/tests/e2e/reports-multiselect.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `data-testid="multiselect-popover"` on the portalled popover; `data-testid="multiselect-listbox"` on its `<ul>`.

Five call sites benefit: `ReportFiltersForm.tsx:171,179,188,229` and `ExportDialog.tsx:159`.

- [ ] **Step 1: Write the failing test**

`global-setup.ts` seeds only 3 clients (one archived), and the `US-52` drag-reorder spec depends on client ordering — so this spec creates and removes its own clients. Playwright runs `workers: 1, fullyParallel: false`, so this is safe.

Create `apps/web/tests/e2e/reports-multiselect.spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXTRA = 10;
const PREFIX = 'ZZZ MultiSelect';

let prisma: PrismaClient;
let createdIds: string[] = [];

test.beforeAll(async () => {
  const world = JSON.parse(
    await readFile(join(import.meta.dirname, '.auth', 'world.json'), 'utf8'),
  ) as { companyId: string };

  prisma = new PrismaClient();
  await prisma.$connect();
  for (let i = 0; i < EXTRA; i++) {
    const c = await prisma.client.create({
      data: { companyId: world.companyId, name: `${PREFIX} ${i}`, sortOrder: 100 + i },
    });
    createdIds.push(c.id);
  }
});

test.afterAll(async () => {
  await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
  createdIds = [];
  await prisma.$disconnect();
});

test.describe('US-98: reports client filter', () => {
  test('US-98: the popover escapes its clipping ancestors and scrolls', async ({ page }) => {
    await page.goto('/reports');

    await page.getByRole('button', { name: /všichni klienti/i }).click();
    const popover = page.getByTestId('multiselect-popover');
    await expect(popover).toBeVisible();

    // 1. It is portalled to <body>, so no ancestor can clip it.
    const parentIsBody = await popover.evaluate((el) => el.parentElement === document.body);
    expect(parentIsBody).toBe(true);

    // 2. It is positioned against the viewport, not a containing block.
    const position = await popover.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');

    // 3. With 12 clients the option list actually overflows and can scroll.
    const list = popover.getByTestId('multiselect-listbox');
    const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // 4. The last option is reachable by scrolling the listbox.
    const last = popover.getByText(`${PREFIX} ${EXTRA - 1}`);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm db:up
pnpm --filter @tt/web build
pnpm test:e2e -- reports-multiselect
```

Expected: FAIL on `getByTestId('multiselect-popover')` — the testid does not exist yet.

- [ ] **Step 3: Rewrite `MultiSelect`'s popover as a portal**

Replace the whole of `apps/web/src/components/MultiSelect.tsx` with:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Optional secondary text — shown muted next to the label. */
  hint?: string;
  /** Optional color swatch (e.g. for tags). */
  color?: string;
}

export interface MultiSelectProps {
  /** Hidden-input name; one input per selected id is rendered for form submit. */
  name: string;
  options: MultiSelectOption[];
  defaultValues?: string[];
  placeholder?: string;
  /** Optional one-letter prefix shown before option labels (decorative). */
  emptyLabel?: string;
  /** Optional: called with the selected ids whenever the selection changes.
   *  Must be a stable reference (e.g. a useState setter). */
  onChange?: (selectedIds: string[]) => void;
}

/** Roughly the popover's tallest realistic height: search + 16rem list + footer. */
const ESTIMATED_POPOVER_HEIGHT = 340;
const GAP = 4;

interface PopoverPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/**
 * Chip-based multi-select with search + checkboxes.
 * Renders hidden inputs so it works inside an HTML form (method=GET).
 *
 * The popover is portalled to <body> and positioned `fixed`. Both of its usual
 * parents clip it otherwise: `Card` is `overflow-hidden` and `ConfirmModal`'s
 * panel is `max-h-[90vh] overflow-y-auto` (AIAGE-51, US-98).
 */
export function MultiSelect({
  name,
  options,
  defaultValues = [],
  placeholder = 'Vyberte…',
  emptyLabel = 'Vše',
  onChange,
}: MultiSelectProps): ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange?.(Array.from(selected));
  }, [selected, onChange]);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const flipUp = spaceBelow < ESTIMATED_POPOVER_HEIGHT && r.top > spaceBelow;
    setPos(
      flipUp
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP }
        : { left: r.left, width: r.width, top: r.bottom + GAP },
    );
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node;
      // The popover is portalled, so it is NOT inside containerRef. Check both.
      if (containerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReflow = (): void => reposition();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // `true` => capture, so scrolls inside any ancestor also reposition us.
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open, reposition]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabels = useMemo(
    () => options.filter((o) => selected.has(o.id)),
    [options, selected],
  );

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearAll(): void {
    setSelected(new Set());
  }

  const popover =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            data-testid="multiselect-popover"
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              ...(pos.top !== undefined ? { top: pos.top } : {}),
              ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
            }}
            /* z-[60] clears ConfirmModal's z-50 (the US-89 export dialog). */
            className="z-[60] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          >
            <div className="flex items-center gap-2 border-b border-zinc-100 px-2 py-1.5 dark:border-zinc-700/60">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hledat…"
                className="flex-1 bg-transparent py-1 text-sm placeholder:text-zinc-400 focus:outline-none dark:placeholder:text-zinc-500"
              />
              {selected.size > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  Vyčistit
                </button>
              ) : null}
            </div>
            {/* Not role="listbox" — a listbox's children must be role="option",
                and these are checkbox labels. A testid avoids a false a11y contract. */}
            <ul
              data-testid="multiselect-listbox"
              className="max-h-[min(16rem,60vh)] overflow-y-auto py-1"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">{emptyLabel}</li>
              ) : null}
              {filtered.map((o) => {
                const checked = selected.has(o.id);
                return (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(o.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-600 dark:text-zinc-100 dark:focus:ring-zinc-100"
                      />
                      {o.color ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: o.color }}
                          aria-hidden
                        />
                      ) : null}
                      <span className="break-words text-zinc-900 dark:text-zinc-100">
                        {o.label}
                      </span>
                      {o.hint ? (
                        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                          {o.hint}
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
            {selected.size > 0 ? (
              <div className="border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-700/60 dark:text-zinc-400">
                Vybráno: {selected.size}
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden inputs for form submit */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[38px] w-full items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-left text-sm text-zinc-900 hover:bg-zinc-50 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
        aria-expanded={open}
      >
        {selectedLabels.length === 0 ? (
          <span className="px-1 text-zinc-400 dark:text-zinc-500">{placeholder}</span>
        ) : (
          <div className="flex flex-1 flex-wrap gap-1">
            {/* Deliberate: at most 4 chips + a +N badge. Not the US-98 bug. */}
            {selectedLabels.slice(0, 4).map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                style={o.color ? { backgroundColor: o.color, color: '#fff' } : undefined}
              >
                {o.label}
                <button
                  type="button"
                  aria-label={`Odebrat ${o.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.id);
                  }}
                  className="text-current opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
            {selectedLabels.length > 4 ? (
              <span className="self-center px-1 text-xs text-zinc-500 dark:text-zinc-400">
                +{selectedLabels.length - 4}
              </span>
            ) : null}
          </div>
        )}
        <span aria-hidden className="ml-auto text-zinc-400 dark:text-zinc-500">
          ▾
        </span>
      </button>

      {popover}
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @tt/web build
pnpm test:e2e -- reports-multiselect
```

Expected: PASS.

- [ ] **Step 5: Regression-check the export dialog**

`ExportDialog.tsx:159` puts a `MultiSelect` inside `ConfirmModal` (`z-50`). The popover is `z-[60]`, so it must render above the modal panel and remain clickable.

```bash
pnpm test:e2e
```

Expected: the full web e2e suite passes, including `destructive-confirm.spec.ts` and any export-dialog coverage.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/MultiSelect.tsx apps/web/tests/e2e/reports-multiselect.spec.ts
git commit -m "fix(web): MultiSelect popover escapes clipping ancestors (US-98)

The popover was \`absolute\`; Card is overflow-hidden and ConfirmModal's panel
is max-h-[90vh] overflow-y-auto, so on /reports the client dropdown was clipped
at the Card's bottom edge and its own max-h/overflow-y-auto scroller never got
to show a scrollbar — you saw ~4 clients and could not scroll.

Portalled to <body> with position:fixed. Adds a popoverRef to the click-outside
handler: the portalled node is no longer a containerRef descendant, so every
click on an option would otherwise have closed the popover."
```

---

### Task 6: Trash — owners restore their own entries, scoped by role (US-91, US-92, US-93)

Today `softDeleteEntry` allows **owner-or-admin** (`time-entries.ts:302`) but `restoreEntry` demands **admin** (`:331`). A member can delete their own entry and never get it back. `/trash` is admin-only in nav (`nav.ts:38`) and its page bypasses the service layer entirely, querying `prisma()` directly behind `requireAdmin()`.

Trash rows also show only description / user / client / deletedAt — an entry with an empty description renders as `(bez popisu)` and is unidentifiable.

Note the delete-confirm copy already promises _"Záznam přesuneme do koše. Můžeš jej do 30 dní obnovit"_ (`cs.json` → `timer.confirm.deleteEntryDescription`). It is false today for every non-admin.

**Files:**

- Modify: `apps/web/src/lib/services/time-entries.ts` (`snapshot` split, `restoreEntry`, `listTrash`)
- Modify: `apps/web/src/lib/actions/time.ts:184-190`
- Modify: `apps/web/src/app/(authenticated)/trash/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/trash/TrashList.tsx`
- Modify: `apps/web/src/app/(authenticated)/nav.ts:38`
- Modify: `apps/web/src/app/(authenticated)/nav.test.ts`
- Create: `apps/web/tests/services/trash.test.ts`

**Interfaces:**

- Consumes: `withTx`, `getTestPrisma`, `stopTestPrisma` from `@tt/db/test`; `createCompany` from `../../src/lib/services/companies.js`.
- Produces:
  - `export interface TrashEntryView { id: string; userId: string; userName: string; description: string; clientName: string | null; projectName: string | null; startedAt: Date; endedAt: Date | null; deletedAt: Date }`
  - `listTrash(db: Db, actorUserId: string, companyId: string): Promise<Result<TrashEntryView[]>>` — **widened** from `{ id, userId, deletedAt }[]`
  - `restoreEntry(db: Db, actorUserId: string, entryId: string): Promise<Result<true>>` — unchanged signature, relaxed authz
  - `snapshotOf(e: EntryWithTags): Record<string, unknown>` — module-private, consumed by Task 8

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/services/trash.test.ts`:

```ts
/**
 * AIAGE-51 — trash scoping, owner restore, enriched rows.
 * Covers US-91, US-92, US-93.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
// Tasks 8 and 9 append `purgeEntry` and `purgeOldDeleted` to this import list.
import {
  listTrash,
  restoreEntry,
  softDeleteEntry,
  startTimer,
} from '../../src/lib/services/time-entries.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  other: string;
  outsider: string;
  company: string;
  otherCompany: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({ data: { email: `tr-a-${suffix}@x.test`, fullName: 'A' } });
  const user = await tx.user.create({ data: { email: `tr-u-${suffix}@x.test`, fullName: 'U' } });
  const other = await tx.user.create({ data: { email: `tr-o2-${suffix}@x.test`, fullName: 'O2' } });
  const outsider = await tx.user.create({
    data: { email: `tr-o-${suffix}@x.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Tr ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  await tx.membership.create({ data: { userId: other.id, companyId: company.id, role: 'user' } });
  const otherCompany = await createCompany(tx, {
    name: `Other ${suffix}`,
    createdByUserId: outsider.id,
  });
  return {
    admin: admin.id,
    user: user.id,
    other: other.id,
    outsider: outsider.id,
    company: company.id,
    otherCompany: otherCompany.id,
  };
}

describe('trash', () => {
  it('US-91: a non-admin owner restores their own soft-deleted entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const before = await tx.auditLog.count({ where: { companyId: w.company } });
      const result = await restoreEntry(tx, w.user, e.value.id);
      expect(result.ok).toBe(true);

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.value.id } });
      expect(reread.deletedAt).toBeNull();

      // Exactly one audit row for the mutation.
      const after = await tx.auditLog.count({ where: { companyId: w.company } });
      expect(after - before).toBe(1);
      const last = await tx.auditLog.findFirst({
        where: { entityId: e.value.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(last?.action).toBe('restore');
    });
  });

  it("US-91: a member cannot restore another member's entry", async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91b');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await restoreEntry(tx, w.other, e.value.id);
      expect(result).toEqual({ ok: false, reason: 'not_found' });

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.value.id } });
      expect(reread.deletedAt).not.toBeNull();
    });
  });

  it('US-91: a cross-company actor restoring returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91c');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await restoreEntry(tx, w.outsider, e.value.id);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it("US-92: a member sees only their own deleted entries; an admin sees everyone's", async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us92');
      const mine = await startTimer(tx, w.user, { companyId: w.company, description: 'mine' });
      const theirs = await startTimer(tx, w.other, { companyId: w.company, description: 'theirs' });
      if (!mine.ok || !theirs.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, mine.value.id);
      await softDeleteEntry(tx, w.other, theirs.value.id);

      const asMember = await listTrash(tx, w.user, w.company);
      expect(asMember.ok).toBe(true);
      if (asMember.ok) {
        expect(asMember.value.map((r) => r.id)).toEqual([mine.value.id]);
      }

      const asAdmin = await listTrash(tx, w.admin, w.company);
      expect(asAdmin.ok).toBe(true);
      if (asAdmin.ok) {
        expect(asAdmin.value.map((r) => r.id).sort()).toEqual(
          [mine.value.id, theirs.value.id].sort(),
        );
      }
    });
  });

  it('US-92: a non-member listing the trash returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us92b');
      const result = await listTrash(tx, w.outsider, w.company);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-93: trash rows expose start, end and duration inputs', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us93');
      const client = await tx.client.create({
        data: { companyId: w.company, name: 'Klient X', sortOrder: 1 },
      });
      const started = new Date(Date.now() - 2 * 3_600_000);
      const ended = new Date(Date.now() - 3_600_000);
      const e = await startTimer(tx, w.user, {
        companyId: w.company,
        description: '',
        clientId: client.id,
      });
      if (!e.ok) throw new Error('setup');
      await tx.timeEntry.update({
        where: { id: e.value.id },
        data: { startedAt: started, endedAt: ended },
      });
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await listTrash(tx, w.user, w.company);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = result.value[0];
      expect(row).toBeDefined();
      expect(row?.startedAt.getTime()).toBe(started.getTime());
      expect(row?.endedAt?.getTime()).toBe(ended.getTime());
      expect(row?.clientName).toBe('Klient X');
      expect(row?.userName).toBe('U');
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });
  });

  it('US-93: a soft-deleted running entry reports a null end', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us93b');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await listTrash(tx, w.user, w.company);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value[0]?.endedAt).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts
```

Expected: FAIL. `US-91` fails with `{ ok: false, reason: 'not_found' }` (restore is admin-only). `US-92`/`US-93` fail on the narrow `listTrash` payload — `r.userName` is `undefined` and the member call returns `not_found`.

- [ ] **Step 3: Split `snapshot` so Task 8 can reuse it**

In `apps/web/src/lib/services/time-entries.ts`, replace `snapshot` (`:69-82`) with:

```ts
type EntryWithTags = Prisma.TimeEntryGetPayload<{ include: { tags: true } }>;

/** The audit `before`/`after` shape. userId/companyId live on the audit row itself. */
function snapshotOf(e: EntryWithTags): Record<string, unknown> {
  return {
    description: e.description,
    note: e.note,
    clientId: e.clientId,
    projectId: e.projectId,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt?.toISOString() ?? null,
    tagIds: e.tags.map((t) => t.tagId).sort(),
    deletedAt: e.deletedAt?.toISOString() ?? null,
  };
}

async function snapshot(db: Db, id: string): Promise<Record<string, unknown> | null> {
  const e = await db.timeEntry.findUnique({ where: { id }, include: { tags: true } });
  if (!e) return null;
  return snapshotOf(e);
}
```

- [ ] **Step 4: Relax `restoreEntry`'s authorization**

In `apps/web/src/lib/services/time-entries.ts`, replace `:330-331`:

```ts
const role = await getMembership(db, actorUserId, entry.companyId);
if (!role || role !== 'admin') return { ok: false, reason: 'not_found' };
```

with the exact check `softDeleteEntry` uses at `:300-302`:

```ts
const role = await getMembership(db, actorUserId, entry.companyId);
if (!role) return { ok: false, reason: 'not_found' };
if (entry.userId !== actorUserId && role !== 'admin') return { ok: false, reason: 'not_found' };
```

- [ ] **Step 5: Widen and scope `listTrash`**

Replace `listTrash` (`time-entries.ts:362-378`) with:

```ts
export interface TrashEntryView {
  id: string;
  userId: string;
  userName: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: Date;
  /** null when a *running* entry was soft-deleted. */
  endedAt: Date | null;
  deletedAt: Date;
}

/**
 * Deleted entries within the 30-day window. Admins see the whole company;
 * a member sees only their own (US-92).
 */
export async function listTrash(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<Result<TrashEntryView[]>> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const rows = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: { not: null },
      ...(role === 'admin' ? {} : { userId: actorUserId }),
    },
    include: { user: true, client: true, project: true },
    orderBy: { deletedAt: 'desc' },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.fullName,
      description: r.description,
      clientName: r.client?.name ?? null,
      projectName: r.project?.name ?? null,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      deletedAt: r.deletedAt!,
    })),
  };
}
```

Also update the file's header comment (`time-entries.ts:16`):

```ts
 *  - listTrash: deleted entries; admins see the company, members see their own.
```

- [ ] **Step 6: Run the service tests**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts
```

Expected: PASS (all 6).

- [ ] **Step 7: Revalidate `/timer` on restore**

In `apps/web/src/lib/actions/time.ts`, replace `restoreEntryAction` (`:184-190`):

```ts
export async function restoreEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await restoreEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze obnovit' };
  revalidatePath('/trash');
  return { ok: true };
}
```

with:

```ts
export async function restoreEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await restoreEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze obnovit' };
  revalidatePath('/trash');
  // Undo (US-94) restores from /timer, which must re-render too.
  revalidatePath('/timer');
  return { ok: true };
}
```

- [ ] **Step 8: Move the trash page onto the service**

Replace `apps/web/src/app/(authenticated)/trash/page.tsx` with:

```tsx
import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { listTrash } from '@/lib/services/time-entries';
import { TrashList } from './TrashList';

export default async function TrashPage(): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const result = await listTrash(prisma(), s.userId, s.activeCompanyId);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Koš" />
        <EmptyState title="Bez přístupu" />
      </div>
    );
  }
  const entries = result.value;
  const isAdmin = s.activeRole === 'admin';
  return (
    <div>
      <PageHeader
        title="Koš"
        description={
          isAdmin
            ? 'Smazané záznamy celé firmy. Po 30 dnech se trvale promazávají.'
            : 'Vaše smazané záznamy. Po 30 dnech se trvale promazávají.'
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Záznamy ({entries.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {entries.length === 0 ? (
            <EmptyState title="Koš je prázdný" />
          ) : (
            <TrashList
              isAdmin={isAdmin}
              entries={entries.map((e) => ({
                id: e.id,
                description: e.description,
                userName: e.userName,
                clientName: e.clientName,
                projectName: e.projectName,
                startedAt: e.startedAt.toISOString(),
                endedAt: e.endedAt?.toISOString() ?? null,
                deletedAt: e.deletedAt.toISOString(),
              }))}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9: Add start / end / duration columns to `TrashList`**

Replace `apps/web/src/app/(authenticated)/trash/TrashList.tsx` with:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import {
  Alert,
  Button,
  Table,
  THead,
  Th,
  Tr,
  Td,
  DataCard,
  DataCardRow,
  DataCardActions,
} from '@tt/ui';
import { restoreEntryAction } from '@/lib/actions/time';
import { fmtDur, fmtTime } from '@/lib/time-format';

interface Entry {
  id: string;
  description: string;
  userName: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string | null;
  deletedAt: string;
}

/** A running entry can be soft-deleted, so `endedAt` may be null. */
function timeRange(e: Entry): string {
  const start = fmtTime(new Date(e.startedAt));
  return e.endedAt ? `${start}–${fmtTime(new Date(e.endedAt))}` : `${start}–…`;
}

function duration(e: Entry): string {
  if (!e.endedAt) return '—';
  return fmtDur(new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime());
}

export function TrashList({
  entries,
  isAdmin,
}: {
  entries: Entry[];
  isAdmin: boolean;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const restore = (id: string): void =>
    startTransition(async () => {
      const r = await restoreEntryAction(id);
      if (!r.ok) setError(r.error);
    });

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Popis</Th>
              {isAdmin ? <Th>Uživatel</Th> : null}
              <Th>Klient</Th>
              <Th>Kdy</Th>
              <Th>Trvání</Th>
              <Th>Smazáno</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {entries.map((e) => (
              <Tr key={e.id}>
                <Td className="max-w-xs truncate">
                  {e.description || (
                    <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
                  )}
                </Td>
                {isAdmin ? <Td>{e.userName}</Td> : null}
                <Td className="text-zinc-700 dark:text-zinc-300">
                  {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
                </Td>
                <Td className="font-mono text-xs tabular-nums">{timeRange(e)}</Td>
                <Td className="font-mono text-xs font-semibold tabular-nums">{duration(e)}</Td>
                <Td className="font-mono text-xs">
                  {new Date(e.deletedAt).toLocaleString('cs-CZ')}
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" loading={pending} onClick={() => restore(e.id)}>
                    Obnovit
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {entries.map((e) => (
          <li key={e.id}>
            <DataCard>
              <DataCardRow label="Popis">
                {e.description || (
                  <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
                )}
              </DataCardRow>
              {isAdmin ? <DataCardRow label="Uživatel">{e.userName}</DataCardRow> : null}
              <DataCardRow label="Klient">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {e.clientName ?? '—'} {e.projectName ? `· ${e.projectName}` : ''}
                </span>
              </DataCardRow>
              <DataCardRow label="Kdy">
                <span className="font-mono text-xs tabular-nums">{timeRange(e)}</span>
              </DataCardRow>
              <DataCardRow label="Trvání">
                <span className="font-mono text-xs font-semibold tabular-nums">{duration(e)}</span>
              </DataCardRow>
              <DataCardRow label="Smazáno">
                <span className="font-mono text-xs">
                  <span className="hidden sm:inline">
                    {new Date(e.deletedAt).toLocaleString('cs-CZ')}
                  </span>
                  <span className="sm:hidden">
                    {new Date(e.deletedAt).toLocaleDateString('cs-CZ')}
                  </span>
                </span>
              </DataCardRow>
              <DataCardActions>
                <Button size="sm" variant="ghost" loading={pending} onClick={() => restore(e.id)}>
                  Obnovit
                </Button>
              </DataCardActions>
            </DataCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 10: Un-gate `/trash` in the nav**

In `apps/web/src/app/(authenticated)/nav.ts:38`, change:

```ts
      { href: '/trash', label: 'Koš', admin: true, icon: 'trash' },
```

to:

```ts
      { href: '/trash', label: 'Koš', icon: 'trash' },
```

- [ ] **Step 11: Update `nav.test.ts` for the un-gated Koš**

Three existing assertions change. `getBottomTabs(false)` is **unaffected** (the first four visible non-admin items are still `/timer`, `/tags`, `/settings`, `/companies`).

In `apps/web/src/app/(authenticated)/nav.test.ts`, replace:

```ts
it('drops Přehledy and Systém for non-admin (all-admin groups)', () => {
  const result = filterVisibleGroups(navGroups, false);
  expect(result.map((g) => g.label)).toEqual(['Sledování', 'Správa dat', 'Účet']);
});
```

with:

```ts
it('drops Přehledy for non-admin but keeps Systém for the un-gated Koš', () => {
  const result = filterVisibleGroups(navGroups, false);
  expect(result.map((g) => g.label)).toEqual(['Sledování', 'Správa dat', 'Systém', 'Účet']);
  expect(result.find((g) => g.label === 'Systém')?.items.map((i) => i.href)).toEqual(['/trash']);
});
```

and replace:

```ts
it('for non-admin leaves only the Účet→Rozšíření overflow', () => {
  expect(getMoreGroups(false).flatMap((g) => g.items.map((i) => i.href))).toEqual(['/extension']);
});
```

with:

```ts
it('for non-admin leaves Koš and the Účet→Rozšíření overflow', () => {
  expect(getMoreGroups(false).flatMap((g) => g.items.map((i) => i.href))).toEqual([
    '/trash',
    '/extension',
  ]);
});
```

- [ ] **Step 12: Run everything**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts src/app/\(authenticated\)/nav.test.ts
pnpm --filter @tt/web exec vitest run tests/services/audit.test.ts
pnpm typecheck && pnpm lint
```

Expected: PASS. `audit.test.ts:98` (`US-46: admin restores from trash`) still passes — admins keep the ability; the check was only widened.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib/services/time-entries.ts apps/web/src/lib/actions/time.ts \
        "apps/web/src/app/(authenticated)/trash/" "apps/web/src/app/(authenticated)/nav.ts" \
        "apps/web/src/app/(authenticated)/nav.test.ts" apps/web/tests/services/trash.test.ts
git commit -m "feat(trash): owners restore their own entries; trash scoped by role (US-91, US-92, US-93)

softDeleteEntry allowed owner-or-admin but restoreEntry demanded admin, so a
member could delete their own entry and never get it back — while the delete
confirmation promised 'Můžeš jej do 30 dní obnovit'.

listTrash now scopes by role (admin: whole company, member: own) and returns
start/end/user/client so an entry with an empty description is identifiable.
The page also stops bypassing the service layer with a raw prisma() query."
```

---

### Task 7: Undo affordance after deleting an entry (US-94)

There is no toast primitive in the repo — no `sonner`, no snackbar, nothing in `packages/ui`. An inline `Alert` above the history list matches how `TrashList` already surfaces messages, needs no portal, and is directly testable.

The undo lives in `TimerLists`, not `TimerHistory`: `TimerLists` owns `handleDeleted` and the history state, and `notifyTimerChanged()` already triggers a refetch that will bring the restored row back.

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TimerLists.tsx`
- Modify: `apps/web/messages/cs.json` (`timer.undo.*`)
- Create: `apps/web/tests/e2e/trash-undo.spec.ts`

**Interfaces:**

- Consumes: `restoreEntryAction` from `@/lib/actions/time` (Task 6, now revalidating `/timer`); `notifyTimerChanged` from `@/lib/timer-events`; `Alert`, `Button` from `@tt/ui`.
- Produces: `export const UNDO_WINDOW_MS = 10_000` from `TimerLists.tsx`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/e2e/trash-undo.spec.ts`. It reuses the start→stop→delete flow already proven in `destructive-confirm.spec.ts:1-25`.

```ts
import { expect, test } from '@playwright/test';

test.describe('US-94: undo a deleted entry', () => {
  test('US-94: deleting an entry offers an undo that restores it', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e undo ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();
    await page.getByRole('button', { name: '■ Stop' }).first().click();

    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    await row.getByTitle('Smazat').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Smazat' }).click();
    await expect(row).toBeHidden();

    // The undo affordance appears and brings the row back.
    const undo = page.getByRole('alert').filter({ hasText: 'Záznam byl smazán' });
    await expect(undo).toBeVisible();
    await undo.getByRole('button', { name: 'Vrátit zpět' }).click();

    await expect(row).toBeVisible();
    await expect(undo).toBeHidden();
  });

  test('US-94: dismissing the undo leaves the entry deleted and in the trash', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e no-undo ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();
    await page.getByRole('button', { name: '■ Stop' }).first().click();

    const row = page.locator('li').filter({ hasText: description });
    await row.getByTitle('Smazat').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat' }).click();
    await expect(row).toBeHidden();

    await page.goto('/trash');
    await expect(page.getByText(description)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @tt/web build
pnpm test:e2e -- trash-undo
```

Expected: the first test FAILS — no `alert` role containing `Záznam byl smazán`. The second test PASSES already (it asserts existing behaviour plus the now-visible-to-admins `/trash`); keep it as a guard that undo does not auto-restore.

- [ ] **Step 3: Add the Czech copy**

In `apps/web/messages/cs.json`, inside the `"timer"` object, add an `"undo"` key next to `"confirm"`:

```json
    "undo": {
      "deleted": "Záznam byl smazán.",
      "action": "Vrátit zpět",
      "failed": "Záznam se nepodařilo obnovit."
    }
```

- [ ] **Step 4: Render the undo Alert in `TimerLists`**

In `apps/web/src/app/(authenticated)/timer/TimerLists.tsx`:

Change the imports at the top of the file to:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@tt/ui';
import { useTranslations } from 'next-intl';
import {
  TIMER_CHANGED_EVENT,
  TimerStateResponseSchema,
  notifyTimerChanged,
  type TimerEntry,
} from '@/lib/timer-events';
import { restoreEntryAction } from '@/lib/actions/time';
import { RunningTimers } from './RunningTimers';
import { TimerHistory, type HistoryEntryView } from './TimerHistory';

/** How long the "Vrátit zpět" affordance stays on screen after a delete. */
export const UNDO_WINDOW_MS = 10_000;
```

If `notifyTimerChanged` is not exported from `@/lib/timer-events`, import it from wherever `TimerHistory.tsx:8` gets it (`@/lib/timer-events`) — it is the same module.

Inside the `TimerLists` component, after `const [now, setNow] = useState<number | null>(null);`, add:

```tsx
const t = useTranslations('timer.undo');
const [undoId, setUndoId] = useState<string | null>(null);
const [undoError, setUndoError] = useState<string | null>(null);
```

Add this effect after the existing tick effect:

```tsx
// The undo affordance is transient — it expires on its own.
useEffect(() => {
  if (!undoId) return;
  const timer = setTimeout(() => setUndoId(null), UNDO_WINDOW_MS);
  return () => clearTimeout(timer);
}, [undoId]);
```

Replace `handleDeleted`:

```tsx
const handleDeleted = (id: string): void => {
  setHistory((hs) => hs.filter((h) => h.id !== id));
};
```

with:

```tsx
const handleDeleted = (id: string): void => {
  setHistory((hs) => hs.filter((h) => h.id !== id));
  setUndoError(null);
  setUndoId(id);
};

const handleUndo = (): void => {
  const id = undoId;
  if (!id) return;
  setUndoId(null);
  void (async () => {
    const result = await restoreEntryAction(id);
    if (!result.ok) {
      // e.g. the entry was purged from the trash in the meantime.
      setUndoError(t('failed'));
      return;
    }
    notifyTimerChanged();
  })();
};
```

Finally, render the Alerts between `RunningTimers` and `TimerHistory`:

```tsx
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
    {undoId ? (
      <Alert tone="info" className="mb-3 flex items-center justify-between gap-3">
        <span>{t('deleted')}</span>
        <Button size="sm" variant="ghost" onClick={handleUndo}>
          {t('action')}
        </Button>
      </Alert>
    ) : null}
    {undoError ? (
      <Alert tone="danger" className="mb-3">
        {undoError}
      </Alert>
    ) : null}
    <TimerHistory
      entries={history}
      onDeleted={handleDeleted}
      autoStackOverlaps={autoStackOverlaps}
      nowMs={historyNowMs}
    />
  </>
);
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @tt/web build
pnpm test:e2e -- trash-undo destructive-confirm
pnpm typecheck && pnpm lint
```

Expected: PASS. `destructive-confirm.spec.ts` still passes — the new Alert appears after its final assertion and does not intercept the row locator.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(authenticated)/timer/TimerLists.tsx" apps/web/messages/cs.json \
        apps/web/tests/e2e/trash-undo.spec.ts
git commit -m "feat(timer): undo affordance after deleting an entry (US-94)

Inline Alert above the history list rather than a new Toast primitive — the
repo has no toast anywhere, and this task would be its only consumer. Lives in
TimerLists because that component owns the history state and handleDeleted.

Expires after 10s; /trash remains the recovery path after that."
```

---

### Task 8: Permanent purge + `purge` audit action (US-95, US-99)

US-46 promised _"restore individual entries **or purge them permanently**"_. Only restore was built. Purge is the sole irreversible operation in the system, so its audit row's `before` snapshot becomes the entry's **only surviving trace** — it must be distinguishable from a soft delete.

Separately, `audit/page.tsx:21`'s `ALL_ACTIONS` is a hand-maintained copy of the Prisma enum that has already drifted: it omits `reorder` and `shift`, both actively written (`catalog.ts:173`, `auto-stack-save.ts:238`). Those rows appear in the unfiltered table but cannot be filtered for. Deriving it from the enum and pinning it with a test makes drift impossible — and `purge` lands in it for free.

`TimeEntryTag.timeEntry` is `onDelete: Cascade` (`schema.prisma:213`), so a hard delete drops the tag joins automatically. **Snapshot the tags first** — after the cascade they are unrecoverable.

**Files:**

- Modify: `packages/db/prisma/schema.prisma:26-42` (`AuditAction`)
- Create: `packages/db/prisma/migrations/<ts>_add_purge_audit_action/migration.sql` (generated)
- Modify: `apps/web/src/lib/services/time-entries.ts` (new `purgeEntry`)
- Modify: `apps/web/src/lib/actions/time.ts` (new `purgeEntryAction`)
- Modify: `apps/web/src/app/(authenticated)/trash/TrashList.tsx` (purge button)
- Create: `apps/web/src/app/(authenticated)/audit/audit-actions.ts`
- Modify: `apps/web/src/app/(authenticated)/audit/page.tsx:19-35`
- Modify: `apps/web/messages/cs.json` (`audit.action.shift`, `audit.action.purge`)
- Modify: `apps/web/tests/services/trash.test.ts` (US-95)
- Modify: `apps/web/tests/services/audit.test.ts` (US-99)

**Interfaces:**

- Consumes: `snapshotOf` (Task 6, module-private in `time-entries.ts`); `writeAudit` from `./audit.js`.
- Produces:
  - `purgeEntry(db: Db, actorUserId: string, entryId: string): Promise<Result<true>>` — admin-only, hard delete, one `purge` audit row.
  - `purgeEntryAction(entryId: string): Promise<ActionResult>`
  - `export const ALL_ACTIONS: AuditAction[]` from `audit/audit-actions.ts` (a **pure** module — see Step 7)

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/services/trash.test.ts`, inside `describe('trash', …)`. Add `purgeEntry` to the import list from `time-entries.js`:

```ts
it('US-95: an admin purges an entry permanently, leaving exactly one purge audit row', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us95');
    const tag = await tx.tag.create({
      data: { companyId: w.company, name: 'T', color: '#fff' },
    });
    const e = await startTimer(tx, w.user, {
      companyId: w.company,
      description: 'doomed',
      tagIds: [tag.id],
    });
    if (!e.ok) throw new Error('setup');
    await softDeleteEntry(tx, w.user, e.value.id);

    const before = await tx.auditLog.count({ where: { companyId: w.company } });
    const result = await purgeEntry(tx, w.admin, e.value.id);
    expect(result.ok).toBe(true);

    // The row is gone, and so are its tag joins (onDelete: Cascade).
    expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).toBeNull();
    expect(await tx.timeEntryTag.count({ where: { timeEntryId: e.value.id } })).toBe(0);

    const after = await tx.auditLog.count({ where: { companyId: w.company } });
    expect(after - before).toBe(1);

    const row = await tx.auditLog.findFirstOrThrow({
      where: { entityId: e.value.id, action: 'purge' },
    });
    // The snapshot is the entry's only surviving trace.
    expect(row.before).toMatchObject({ description: 'doomed', tagIds: [tag.id] });
    expect(row.after).toBeNull();
  });
});

it('US-95: a member cannot purge their own entry', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us95b');
    const e = await startTimer(tx, w.user, { companyId: w.company });
    if (!e.ok) throw new Error('setup');
    await softDeleteEntry(tx, w.user, e.value.id);

    expect(await purgeEntry(tx, w.user, e.value.id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).not.toBeNull();
  });
});

it('US-95: purging a cross-company entry returns not_found', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us95c');
    const e = await startTimer(tx, w.user, { companyId: w.company });
    if (!e.ok) throw new Error('setup');
    await softDeleteEntry(tx, w.user, e.value.id);

    expect(await purgeEntry(tx, w.outsider, e.value.id)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

it('US-95: purging an entry that is not in the trash returns not_found', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us95d');
    const e = await startTimer(tx, w.user, { companyId: w.company });
    if (!e.ok) throw new Error('setup');

    expect(await purgeEntry(tx, w.admin, e.value.id)).toEqual({ ok: false, reason: 'not_found' });
  });
});
```

Append to `apps/web/tests/services/audit.test.ts` a new `describe` block at the end of the file. Note it imports a **pure** module, not `audit/page.tsx` — importing a server component would drag in `@/lib/session` → `next/headers`.

Add to the imports at the top of `audit.test.ts`:

```ts
import { AuditAction } from '@prisma/client';
import { ALL_ACTIONS } from '../../src/app/(authenticated)/audit/audit-actions.js';
```

and at the end of the file:

```ts
describe('audit action filter', () => {
  it('US-99: the filter offers every AuditAction value', () => {
    expect(new Set(ALL_ACTIONS)).toEqual(new Set(Object.values(AuditAction)));
  });
});
```

`audit.test.ts:7` already has `import type { AuditSource } from '@prisma/client';` — merge the new **value** import rather than duplicating the specifier.

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts tests/services/audit.test.ts
```

Expected: FAIL. `purgeEntry` is not exported (`TypeError: purgeEntry is not a function`); `US-99` fails because `ALL_ACTIONS` is not exported, and once exported it would still be missing `reorder`, `shift`, `purge`.

- [ ] **Step 3a: Repair the migration drift FIRST (separate commit)**

> **Discovered during execution.** Nothing in this project applies `packages/db/prisma/migrations/`. Production runs `prisma db push --skip-generate --accept-data-loss` on every container start (`docker/web.Dockerfile:40`); CI does the same (`.github/workflows/ci.yml:95`); and testcontainers do too (`packages/db/src/test/index.ts:40`). Because `db push` treats `schema.prisma` as the source of truth, the migrations directory has silently drifted: commit `b4d9c98 feat(time-entries): add a separate 'note' field` added `TimeEntry.note` to the schema and shipped no migration. No migration anywhere creates that column.
>
> This blocks Step 3b: `prisma migrate dev` diffs migration history against `schema.prisma`, will detect the missing `note`, and will either fold it into our migration or demand a dev-DB reset.

Repair the record before adding to it. Create `packages/db/prisma/migrations/<timestamp>_add_time_entry_note/migration.sql` containing exactly:

```sql
-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
```

Use a timestamp that sorts **after** `20260611123000_add_email_send_attempts` and **before** the migration you generate in Step 3b. Then mark it as already applied to your local dev DB (which `db push` already gave the column):

```bash
pnpm db:up
pnpm --filter @tt/db exec prisma migrate resolve --applied <timestamp>_add_time_entry_note
```

Verify `prisma migrate status` no longer reports drift for `note`. Commit this on its own:

```bash
git add packages/db/prisma/migrations/
git commit -m "fix(db): add the missing time_entries.note migration

b4d9c98 added TimeEntry.note to schema.prisma and shipped no migration. Nothing
caught it because db push — which is what CI, testcontainers and the production
container start all use — treats the schema as the source of truth. The
migrations directory has been lying since then, and prisma migrate dev refuses
to generate a clean migration on top of the drift."
```

- [ ] **Step 3b: Add `purge` to the enum and migrate**

In `packages/db/prisma/schema.prisma`, add `purge` to `AuditAction` immediately after `restore`:

```prisma
enum AuditAction {
  create
  update
  delete
  restore
  purge
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

Generate the migration:

```bash
pnpm db:up
pnpm --filter @tt/db exec prisma migrate dev --name add_purge_audit_action
pnpm prisma:generate
```

Expected: `migration.sql` contains `ALTER TYPE "AuditAction" ADD VALUE 'purge';` **and nothing else** — if it also contains the `note` column, Step 3a was not done correctly.

> Postgres 16 permits `ALTER TYPE … ADD VALUE` inside a transaction **as long as the new value is not used in the same transaction**. Prisma's generated migration satisfies that. This gets a `docs/gotchas.md` entry in Task 10.
>
> Note the migration is, today, **documentation only** — `db push` is what actually applies the enum value in tests, CI and production. It is still worth having: it keeps the historical record truthful, and ADR-0012 (Task 10) proposes moving the deploy to `prisma migrate deploy`, at which point these files start to matter.

- [ ] **Step 4: Implement `purgeEntry`**

In `apps/web/src/lib/services/time-entries.ts`, add immediately after `restoreEntry` (before `purgeOldDeleted`):

```ts
/**
 * Hard-delete a soft-deleted entry. Admin-only, irreversible.
 *
 * The audit row's `before` snapshot is the entry's only surviving trace, so it
 * is captured *before* the delete cascades `TimeEntryTag` away (US-95).
 */
export async function purgeEntry(
  db: Db,
  actorUserId: string,
  entryId: string,
): Promise<Result<true>> {
  const entry = await db.timeEntry.findUnique({
    where: { id: entryId },
    include: { tags: true },
  });
  if (!entry || !entry.deletedAt) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role || role !== 'admin') return { ok: false, reason: 'not_found' };

  const before = snapshotOf(entry);
  await db.timeEntry.delete({ where: { id: entryId } });
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'purge',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
  });
  return { ok: true, value: true };
}
```

Also extend the file header comment (`time-entries.ts:17`):

```ts
 *  - purgeEntry: admin-only hard delete from the trash; one `purge` audit row.
```

- [ ] **Step 5: Add the server action**

In `apps/web/src/lib/actions/time.ts`, add `purgeEntry` to the service import list, then append:

```ts
export async function purgeEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await purgeEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze trvale smazat' };
  revalidatePath('/trash');
  return { ok: true };
}
```

- [ ] **Step 6: Add the admin-only purge button to `TrashList`**

In `apps/web/src/app/(authenticated)/trash/TrashList.tsx`:

Extend the imports:

```tsx
import { restoreEntryAction, purgeEntryAction } from '@/lib/actions/time';
```

and add `useConfirm` to the `@tt/ui` import list.

Inside the component, after `const restore = …`, add:

```tsx
const confirm = useConfirm();

const purge = (id: string): void => {
  void (async () => {
    const ok = await confirm({
      title: 'Trvale smazat záznam?',
      description: 'Tuto akci nelze vrátit zpět. Záznam bude nenávratně odstraněn.',
      confirmLabel: 'Trvale smazat',
      tone: 'danger',
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await purgeEntryAction(id);
      if (!r.ok) setError(r.error);
    });
  })();
};
```

Then in **both** the desktop `<Td className="text-right">` and the mobile `<DataCardActions>`, render the purge button after "Obnovit", gated on `isAdmin`:

```tsx
<Button size="sm" variant="ghost" loading={pending} onClick={() => restore(e.id)}>
  Obnovit
</Button>;
{
  isAdmin ? (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => purge(e.id)}
      className="text-red-600 hover:text-red-700 dark:text-red-400"
    >
      Trvale smazat
    </Button>
  ) : null;
}
```

- [ ] **Step 7: Derive `ALL_ACTIONS` from the enum, in a pure module**

`ALL_ACTIONS` must be importable by a vitest test. It cannot live in `audit/page.tsx`, because importing that server component pulls in `@/lib/session` → `next/headers`. Put it in its own module.

Create `apps/web/src/app/(authenticated)/audit/audit-actions.ts`:

```ts
import { AuditAction } from '@prisma/client';

/**
 * Every action the audit log can record. Derived from the Prisma enum rather
 * than hand-maintained — the old hardcoded list had silently drifted, omitting
 * `reorder` and `shift` (both actively written by catalog.ts and
 * auto-stack-save.ts), so those rows showed up in the unfiltered table but
 * could not be filtered for. Pinned by a test (US-99).
 *
 * Kept out of `page.tsx` so tests can import it without dragging in
 * `next/headers` via `@/lib/session`.
 */
export const ALL_ACTIONS: AuditAction[] = Object.values(AuditAction);
```

Then in `apps/web/src/app/(authenticated)/audit/page.tsx`, delete `:19-35`:

```tsx
import type { AuditAction } from '@prisma/client';

const ALL_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'restore',
  'invite',
  'invite_accepted',
  'invite_revoked',
  'remove_member',
  'role_change',
  'login',
  'logout',
  'totp_enable',
  'totp_disable',
];
```

and replace it with:

```tsx
import type { AuditAction } from '@prisma/client';
import { ALL_ACTIONS } from './audit-actions';
```

The rest of the file already uses `ALL_ACTIONS.includes(...)` (`:46`) and maps it into `<option>`s (`:92`) — no further change. `AuditAction` is still needed as a type for the `sp.action as AuditAction` casts.

- [ ] **Step 8: Keep the Czech action catalogue honest**

`apps/web/messages/cs.json` → `audit.action` mirrors the enum but is missing `shift` and now `purge`. Add both, after `"restore"`:

```json
      "purge": "trvalé smazání",
```

and after `"reorder"`:

```json
      "shift": "posun záznamu",
```

- [ ] **Step 9: Run the tests**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts tests/services/audit.test.ts
pnpm typecheck && pnpm lint
```

Expected: PASS (10 in `trash.test.ts`, all of `audit.test.ts` including the new US-99).

Confirm the immutability grep at `audit.test.ts:149-181` still passes — `purgeEntry` calls `timeEntry.delete`, **not** `auditLog.delete`, so it must not trip the check.

- [ ] **Step 10: Commit**

```bash
git add packages/db/prisma/ apps/web/src/lib/services/time-entries.ts apps/web/src/lib/actions/time.ts \
        "apps/web/src/app/(authenticated)/trash/TrashList.tsx" "apps/web/src/app/(authenticated)/audit/" \
        apps/web/messages/cs.json apps/web/tests/services/trash.test.ts apps/web/tests/services/audit.test.ts
git commit -m "feat(trash): permanent purge + purge audit action (US-95, US-99)

US-46 promised 'restore individual entries or purge them permanently'; only
restore was built. Purge is the one irreversible operation, so its audit row's
before-snapshot is the entry's only surviving trace — hence a distinct \`purge\`
action rather than reusing \`delete\`. Tags are snapshotted before the
TimeEntryTag cascade drops them.

Also derives audit/page.tsx's ALL_ACTIONS from the Prisma enum. The hardcoded
copy had drifted, omitting reorder and shift; a test now pins it."
```

---

### Task 9: Daily purge endpoint + Coolify scheduled task (US-96)

`purgeOldDeleted()` (`time-entries.ts:353`) exists, is tested, and is **never called in production**. Nothing imports `node-cron` despite it being a declared dependency (`apps/web/package.json:35`), and `docs/reference/data-model.md:84` documents a daily job that does not exist. The trash page's "Po 30 dnech se trvale promazávají" is currently false, and the trash grows without bound. We just showed `/trash` to every member (Task 6), so this now matters.

Two behaviour changes to `purgeOldDeleted`:

1. It writes **one `purge` audit row per entry** (`actorUserId: null`). Constitution §3 requires every mutation to produce exactly one audit row; a bare `deleteMany` produced none, and purge is precisely where the snapshot matters most. This is a deliberate reading of §3 as covering system-initiated mutations.
2. Audit rows are written **before** the delete. A crash between the two leaves audit rows for entries that still exist, and the next run re-audits them (duplicate rows). The reverse order would lose audit rows for entries that are already gone. Duplicates are the lesser evil.

**`/api/cron/purge` returns 401, not 404.** Constitution §3's "404 never 403" rule exists to prevent cross-company existence leaks. This endpoint serves no company-scoped data and leaks nothing by admitting it exists. It is the only auth failure in the codebase that is not a 404; the reasoning lives in ADR-0011.

**Files:**

- Modify: `apps/web/src/lib/services/time-entries.ts:352-359` (`purgeOldDeleted`)
- Create: `apps/web/src/app/api/cron/purge/route.ts`
- Create: `apps/web/tests/services/cron-purge-route.test.ts`
- Modify: `apps/web/tests/services/time-entries.test.ts:470` (name the US)
- Modify: `apps/web/tests/services/trash.test.ts` (US-96 service coverage)
- Modify: `apps/web/package.json` (drop `node-cron`, `@types/node-cron`)
- Create: `docs/decisions/0011-coolify-scheduled-task-for-purge.md`
- Modify: `.env.example`, `docs/reference/env-vars.md`

**Interfaces:**

- Consumes: `snapshotOf`, `writeAudit`, `TRASH_RETENTION_MS` (all already in `time-entries.ts`).
- Produces: `purgeOldDeleted(db: Db, now?: Date): Promise<{ purged: number }>` — unchanged signature, now audits. `POST /api/cron/purge` → `{ purged: number }` or `401 { error: 'unauthorized' }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/services/trash.test.ts`, inside `describe('trash', …)`. Add `purgeOldDeleted` to the service import list:

```ts
it('US-96: the daily purge hard-deletes >30-day-old entries and audits each one', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us96');
    const old = await startTimer(tx, w.user, { companyId: w.company, description: 'old' });
    const fresh = await startTimer(tx, w.user, { companyId: w.company, description: 'fresh' });
    if (!old.ok || !fresh.ok) throw new Error('setup');

    const now = new Date('2026-05-03T00:00:00Z');
    const longAgo = new Date(now.getTime() - 31 * 24 * 3_600_000);
    const recently = new Date(now.getTime() - 29 * 24 * 3_600_000);
    await softDeleteEntry(tx, w.user, old.value.id, longAgo);
    await softDeleteEntry(tx, w.user, fresh.value.id, recently);

    const before = await tx.auditLog.count({ where: { companyId: w.company } });
    const result = await purgeOldDeleted(tx, now);
    expect(result.purged).toBe(1);

    expect(await tx.timeEntry.findUnique({ where: { id: old.value.id } })).toBeNull();
    expect(await tx.timeEntry.findUnique({ where: { id: fresh.value.id } })).not.toBeNull();

    // Exactly one audit row per purged entry, actor-less (system-initiated).
    const after = await tx.auditLog.count({ where: { companyId: w.company } });
    expect(after - before).toBe(1);
    const row = await tx.auditLog.findFirstOrThrow({
      where: { entityId: old.value.id, action: 'purge' },
    });
    expect(row.actorUserId).toBeNull();
    expect(row.before).toMatchObject({ description: 'old' });
  });
});

it('US-96: a purge run with nothing to purge writes no audit rows', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'us96b');
    const before = await tx.auditLog.count({ where: { companyId: w.company } });
    expect((await purgeOldDeleted(tx, new Date())).purged).toBe(0);
    expect(await tx.auditLog.count({ where: { companyId: w.company } })).toBe(before);
  });
});
```

Create `apps/web/tests/services/cron-purge-route.test.ts`, mirroring `v1-timer-stop-route.test.ts`'s mocking pattern:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';

const ctx = vi.hoisted(() => ({ db: null as unknown as Prisma.TransactionClient }));
vi.mock('@/lib/session', () => ({ prisma: () => ctx.db, SESSION_COOKIE: 'tt-session' }));

const { POST } = await import('../../src/app/api/cron/purge/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

const SECRET = 'test-cron-secret';
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
});
// stubEnv persists across tests otherwise, leaking into the unset-secret case.
afterEach(() => {
  vi.unstubAllEnvs();
});

function req(auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/purge', {
    method: 'POST',
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe('POST /api/cron/purge', () => {
  it('US-96: a correct bearer secret runs the purge', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const res = await POST(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ purged: 0 });
    });
  });

  it('US-96: a missing Authorization header is rejected with 401', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const res = await POST(req());
      expect(res.status).toBe(401);
    });
  });

  it('US-96: a wrong secret is rejected with 401', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      expect((await POST(req('Bearer nope'))).status).toBe(401);
      // Same length as SECRET — exercises the timing-safe compare, not the length guard.
      expect((await POST(req(`Bearer ${'x'.repeat(SECRET.length)}`))).status).toBe(401);
    });
  });

  it('US-96: an unset CRON_SECRET rejects every request', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      vi.stubEnv('CRON_SECRET', '');
      expect((await POST(req('Bearer '))).status).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts tests/services/cron-purge-route.test.ts
```

Expected: FAIL. The route module does not exist; `US-96: the daily purge … audits each one` fails on `after - before` being `0`.

Note `softDeleteEntry(tx, userId, id, now)` already accepts an injectable `now` (`time-entries.ts:296`) — that is how the test backdates `deletedAt` without stubbing the clock.

- [ ] **Step 3: Make `purgeOldDeleted` audit what it destroys**

In `apps/web/src/lib/services/time-entries.ts`, replace `:352-359`:

```ts
/** Daily cron — purges anything soft-deleted >30 days ago. */
export async function purgeOldDeleted(db: Db, now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  const { count } = await db.timeEntry.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  return { purged: count };
}
```

with:

```ts
/**
 * Daily cron — hard-deletes anything soft-deleted >30 days ago.
 *
 * Writes one `purge` audit row per entry (`actorUserId: null`, system-initiated)
 * before deleting, because the snapshot is the entry's only surviving trace.
 * Audit-then-delete is deliberate: a crash between the two leaves audit rows for
 * entries that still exist and the next run re-audits them, whereas
 * delete-then-audit would lose the trace entirely.
 */
export async function purgeOldDeleted(db: Db, now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  const doomed = await db.timeEntry.findMany({
    where: { deletedAt: { lt: cutoff } },
    include: { tags: true },
  });
  if (doomed.length === 0) return { purged: 0 };

  for (const entry of doomed) {
    await writeAudit(db, {
      companyId: entry.companyId,
      actorUserId: null,
      action: 'purge',
      entityType: 'TimeEntry',
      entityId: entry.id,
      before: snapshotOf(entry) as never,
    });
  }

  const { count } = await db.timeEntry.deleteMany({
    where: { id: { in: doomed.map((e) => e.id) } },
  });
  return { purged: count };
}
```

- [ ] **Step 4: Add the route**

Create `apps/web/src/app/api/cron/purge/route.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/session';
import { purgeOldDeleted } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

const BEARER = 'Bearer ';

/**
 * 401 rather than 404: the constitution's "404 never 403" rule exists to
 * prevent cross-company existence leaks. This endpoint serves no company-scoped
 * data. See ADR-0011.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith(BEARER)) return false;
  const provided = Buffer.from(header.slice(BEARER.length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await purgeOldDeleted(prisma());
  return Response.json(result);
}
```

- [ ] **Step 5: Name the US on the pre-existing purge test**

`apps/web/tests/services/time-entries.test.ts:470` has an untraced test. Rename it so `test:trace` sees US-96 there too:

```ts
  it('US-96: purge cron deletes only entries soft-deleted >30 days ago', async () => {
```

Its assertion `expect(result.purged).toBe(1)` is unchanged by Task 9.

- [ ] **Step 6: Drop the dead dependency**

`node-cron` was never imported. Remove from `apps/web/package.json`:

```
    "node-cron": "^3.0.3",
```

```
    "@types/node-cron": "^3.0.11",
```

Then:

```bash
pnpm install
```

- [ ] **Step 7: Document the env var**

Add to `.env.example`:

```
# Shared secret for POST /api/cron/purge. Generate with `openssl rand -hex 32`.
CRON_SECRET=
```

Add a row to the table in `docs/reference/env-vars.md`, after `BACKUP_RETENTION_DAYS`:

```
| `CRON_SECRET`           | Bearer token for `POST /api/cron/purge`, called daily by a Coolify scheduled task. **Generate with `openssl rand -hex 32`.** Unset ⇒ the endpoint rejects every request. | `<32-byte hex>` |
```

- [ ] **Step 8: Write ADR-0011**

Create `docs/decisions/0011-coolify-scheduled-task-for-purge.md`:

```markdown
# 0011 — Coolify scheduled task for the trash purge

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Michal Lénert
- **Related:** AIAGE-51, US-96, [`0006-coolify-expose-not-ports.md`](0006-coolify-expose-not-ports.md)

## Context

`purgeOldDeleted()` has existed and been unit-tested since the trash feature
landed, but nothing ever called it. `node-cron` was a declared dependency of
`apps/web` with zero imports anywhere in the repo, and
`docs/reference/data-model.md` described "a daily `node-cron` job" that did not
exist. The trash grew without bound and the UI copy "Po 30 dnech se trvale
promazávají" was false.

AIAGE-51 exposes `/trash` to every member (US-92), so the retention promise now
has to be real.

## Decision

Expose `POST /api/cron/purge`, guarded by a `CRON_SECRET` bearer token compared
with `crypto.timingSafeEqual`, and drive it from a **Coolify scheduled task**
running daily. Drop the unused `node-cron` dependency.

The endpoint returns **401** on an auth failure, not the 404 that the
constitution mandates elsewhere. That rule exists to prevent cross-company
existence leaks; this endpoint serves no company-scoped data and leaks nothing
by admitting it exists.

## Alternatives considered

### Alternative A — `node-cron` inside `apps/web/src/instrumentation.ts`

Matches the already-documented intent and the existing dependency. Needs a
`NEXT_RUNTIME === 'nodejs'` guard and an HMR double-register guard. The purge is
idempotent (`deletedAt < cutoff`), so concurrent replicas would be harmless.

Rejected because the job would be invisible: no run history, no logs surfaced
anywhere, and no way to trigger it by hand when investigating. It would have
become viable if we already had a job-observability story in-process.

### Alternative B — `node-cron` inside `apps/ws`

`apps/ws` is a single instance, so it would fire exactly once with no guards.

Rejected because `apps/ws` is Redis-only today and has no Prisma client. This
would pull the entire DB layer into a process that does not otherwise need it,
to schedule one daily query.

## Consequences

### Positive

- Run history, exit codes and logs are visible in Coolify's UI.
- The job can be triggered by hand during an incident with one `curl`.
- No in-process scheduler; no double-fire across replicas.
- `apps/web` sheds a dependency it never used.

### Negative

- One more secret to manage (`CRON_SECRET`). Unset ⇒ the endpoint is inert
  (rejects everything), which fails closed but silently.
- The purge is not wrapped in a transaction, so a crash mid-run can leave
  `purge` audit rows for entries that still exist. The next run re-audits them.
  Duplicate audit rows were judged strictly better than losing the snapshot of
  an entry that is already gone.

### Neutral

- This is the only endpoint in the codebase whose auth failure is a 401.

## Follow-ups

- [ ] Register the scheduled task in Coolify: daily,
      `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/purge"`
- [ ] Set `CRON_SECRET` in the Coolify environment.
```

- [ ] **Step 9: Run the tests**

```bash
pnpm --filter @tt/web exec vitest run tests/services/trash.test.ts tests/services/cron-purge-route.test.ts tests/services/time-entries.test.ts
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/api/cron/ apps/web/src/lib/services/time-entries.ts \
        apps/web/tests/services/cron-purge-route.test.ts apps/web/tests/services/trash.test.ts \
        apps/web/tests/services/time-entries.test.ts apps/web/package.json pnpm-lock.yaml \
        .env.example docs/reference/env-vars.md docs/decisions/0011-coolify-scheduled-task-for-purge.md
git commit -m "feat(ops): daily purge endpoint + Coolify scheduled task (US-96)

purgeOldDeleted() has existed and been tested since the trash landed, but
nothing ever called it — node-cron was declared and never imported, and the
trash page's '30 days' copy was false. Task 6 just showed /trash to every
member, so the retention promise has to be real.

purgeOldDeleted now writes one \`purge\` audit row per entry (actorUserId null)
before deleting: purge is the only irreversible operation and the snapshot is
the entry's only surviving trace.

The endpoint returns 401, not 404 — the constitution's 404 rule guards against
cross-company existence leaks and this endpoint serves no company data. See
ADR-0011."
```

---

### Task 10: Extension 1.6.0, docs, and `TOTAL_US = 99`

`pnpm test:trace` walks every test file for `\bUS-N\b` and fails if any of `US-1..TOTAL_US` has zero matches. Bumping `TOTAL_US` last means the tracker turns green only once every story has a test.

**Files:**

- Modify: `apps/extension/package.json` (`version`), `apps/extension/public/manifest.json` if it pins a version
- Modify: `scripts/test-trace.ts:10`
- Modify: `docs/reference/features.md`
- Modify: `docs/reference/data-model.md:48-53,80-84`
- Modify: `docs/reference/acceptance.md:27`
- Modify: `docs/gotchas.md`
- Create: `docs/decisions/0012-prisma-migrate-deploy-over-db-push.md`
- Modify: `apps/extension/src/DESCRIPTION.md`

- [ ] **Step 1: Bump the extension version**

`apps/extension/package.json` → `"version": "1.6.0"`. Check whether `apps/extension/public/manifest.json` hardcodes a version; if so, bump it to match.

```bash
grep -n '"version"' apps/extension/package.json apps/extension/public/manifest.json
```

- [ ] **Step 2: Record the user stories**

Append to `docs/reference/features.md`, before the `## Coverage check` section:

```markdown
## Time tracker fixes (AIAGE-51)

- **US-90** — The extension's running row renders `HH:MM:SS` and updates every second; stopped rows, day totals and summary cards stay `HH:MM`. Partial revert of AIAGE-28, which had removed seconds everywhere in the extension. Because the tick is now gated on a running timer, a sheet captures `nowIso` when it opens.
- **US-91** — A non-admin owner restores their own soft-deleted entry, producing exactly one `restore` audit row. Another member's entry, or a cross-company entry, returns `not_found`.
- **US-92** — `/trash` is scoped by role: a member sees only their own deleted entries; an admin sees every member's in the active company; a non-member gets `not_found`.
- **US-93** — Trash rows expose start, end and duration, so an entry with no description is identifiable. A soft-deleted _running_ entry shows a null end.
- **US-94** — After deleting an entry, an undo affordance restores it; letting it expire (10 s) leaves the entry in the trash.
- **US-95** — An admin purges an entry permanently from the trash. The row is hard-deleted (cascading its tag joins) and exactly one `purge` audit row survives, carrying the `before` snapshot. Members cannot purge; cross-company returns `not_found`.
- **US-96** — `POST /api/cron/purge` hard-deletes entries soft-deleted more than 30 days ago, writing one actor-less `purge` audit row each; entries younger than 30 days are kept. A missing or incorrect `CRON_SECRET` returns 401. Driven by a Coolify scheduled task (ADR-0011).
- **US-97** — Opening an entry sheet in the extension while the popup is scrolled shows the sheet's header and `Název` field, because the sheet is pinned to the viewport (`fixed`, not `absolute`, which stretched it across the document-tall root).
- **US-98** — The `MultiSelect` popover renders above its clipping ancestors (`Card`'s `overflow-hidden`, `ConfirmModal`'s `overflow-y-auto`) and scrolls when its options exceed its max height.
- **US-99** — The audit action filter offers every `AuditAction` value, derived from the Prisma enum so it cannot drift.
```

Also update the closing line of `## Coverage check`:

```markdown
Walks every test file (`*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, `tests/**`) and looks for `\bUS-N\b`. Exits non-zero if any of US-1..US-99 has zero matches.
```

- [ ] **Step 3: Bump `TOTAL_US`**

`scripts/test-trace.ts:10`:

```ts
const TOTAL_US = 99;
```

- [ ] **Step 4: Correct the reference docs**

`docs/reference/data-model.md`:

- In the `AuditLog` section (`:48-53`), add `purge` to the listed `action` values.
- Replace the sentence at `:84` — "A daily `node-cron` job purges any TimeEntry with `deleted_at < now() - 30 days`" — with:

```markdown
A daily Coolify scheduled task calls `POST /api/cron/purge`, which hard-deletes any TimeEntry with `deleted_at < now() - 30 days` and writes one actor-less `purge` audit row per entry. See [ADR-0011](../decisions/0011-coolify-scheduled-task-for-purge.md).
```

`docs/reference/acceptance.md:27` claims every US-19..28 test in `time-entries.test.ts` asserts the audit row count via `auditCount()`. That helper does not exist in that file — it is defined locally in `catalog.test.ts:57` and `auto-stack-save.test.ts:68`, with different signatures, and `time-entries.test.ts` queries `auditLog.findMany()` directly. Correct the sentence to say so.

- [ ] **Step 5: Log the gotchas**

Append to `docs/gotchas.md`:

```markdown
### 2026-07-08 — `ALTER TYPE … ADD VALUE` fails inside a Prisma migration transaction

**Symptom.** Adding a value to a Postgres enum and using it in the same
migration aborts with `unsafe use of new value of enum type`.

**Cause.** Postgres will not let a newly-added enum value be _used_ in the same
transaction that adds it. Prisma wraps each migration in a transaction.

**Fix.** Adding the value alone is fine (that is all
`add_purge_audit_action` does). If a migration ever needs to add a value _and_
write rows using it, split it into two migration files.

### 2026-07-08 — `absolute inset-0` inside a document-tall `relative` root

**Symptom.** The Chrome extension's edit sheet opened with its header and title
field above the fold; scrolled down, the first visible element was the
description textarea.

**Cause.** `AppShell`'s root is `relative` and grows to the full document height
(header + lists + entire history). `absolute inset-0` therefore spans the whole
document, not the popup viewport. The sheet's inner `overflow-y-auto` also never
scrolled, because its flex parent had no bounded height.

**Fix.** `fixed inset-0` (which `AutoStackSheet` already used), plus
`min-h-0 flex-1` on the inner scroller and a body scroll lock. A flex child's
default `min-height: auto` refuses to shrink below its content — without
`min-h-0`, `overflow-y-auto` is inert.
```

- [ ] **Step 5b: Write ADR-0012 — propose `prisma migrate deploy`**

> **Discovered during execution.** `docker/web.Dockerfile:40` runs `prisma db push --skip-generate --accept-data-loss` on every production container start. `db push` reconciles the live database to `schema.prisma` with no review step, and `--accept-data-loss` means a schema change that removes or narrows a column drops that column's data silently, on deploy. The flag's name says it out loud. CI (`ci.yml:95`) and testcontainers (`packages/db/src/test/index.ts:40`) use the same mechanism — which is why the `TimeEntry.note` migration gap (repaired in Task 8, Step 3a) went unnoticed for so long.

Create `docs/decisions/0012-prisma-migrate-deploy-over-db-push.md` using [`_template.md`](../../decisions/_template.md). It **proposes** the change; it does not implement it. Status: `Proposed`.

Content requirements:

- **Context:** cite `docker/web.Dockerfile:40`, `.github/workflows/ci.yml:95`, `packages/db/src/test/index.ts:40`. State the concrete hazard: `--accept-data-loss` will drop a column's data on the next container start if a field is removed from `schema.prisma`, with no migration review and no operator confirmation. Note the observed consequence: the migrations directory drifted (`b4d9c98`) and nothing failed.
- **Decision:** propose that the production container run `prisma migrate deploy`, and that `db push` be confined to tests and local development, where a disposable database makes it the right tool.
- **Alternatives considered** (at least two, each with a real rationale for rejection — "no time" is not one):
  - _Keep `db push` everywhere._ It is genuinely simpler and has worked. Rejected because the failure mode is silent data loss, not a broken deploy.
  - _`db push` plus a pre-deploy `migrate diff` check in CI._ Would surface drift without changing the deploy. Weaker: it detects the drift but still applies the destructive change at boot.
- **Consequences:** migrations become load-bearing, so every schema change must ship one (`pnpm prisma:migrate`), and a failed migration halts the deploy instead of silently reshaping the DB. Note that the migrations directory is only now truthful again, as of Task 8's Step 3a.
- **Follow-ups:** an unchecked box to change `docker/web.Dockerfile:40`, plus one to decide whether CI should switch too.

Do **not** change `docker/web.Dockerfile` in this task. ADRs are append-only and this one is `Proposed`, not `Accepted`.

- [ ] **Step 6: Update the extension DESCRIPTION**

`apps/extension/src/DESCRIPTION.md:39` lists `@tt/ui` and `@tt/shared` as internal dependencies. Until Task 3 that was aspirational — nothing imported either. Correct it to state that `@tt/shared/time/duration` is now imported (leaf only, to keep `zod`, `date-fns-tz` and the WS client out of the popup bundle) and that `@tt/ui` remains declared-but-unused. Note the new `tests/e2e/` Playwright suite.

- [ ] **Step 7: Full verification**

```bash
pnpm db:up
pnpm prisma:generate && pnpm prisma:migrate
pnpm test:all          # lint + typecheck + unit/integration + trace
pnpm --filter @tt/web build && pnpm test:e2e
pnpm test:e2e:ext
```

Expected: green, and `US coverage: 99/99 (100.0%)`.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/package.json apps/extension/public/manifest.json apps/extension/src/DESCRIPTION.md \
        scripts/test-trace.ts docs/
git commit -m "chore(ext): bump to 1.6.0; docs: record US-90..US-99, TOTAL_US 89->99

Also corrects three stale claims: data-model.md described a node-cron purge job
that never existed (ADR-0011 replaces it), acceptance.md claimed
time-entries.test.ts asserts via an auditCount() helper it does not define, and
the extension DESCRIPTION listed @tt/shared as a dependency nothing imported."
```

---

## Verification checklist

Run before opening the PR:

```bash
pnpm test:all          # lint + typecheck + vitest + test:trace (must be 99/99)
pnpm --filter @tt/web build && pnpm test:e2e
pnpm test:e2e:ext
```

Manual checks that no test covers:

1. **Extension running row at 380 px.** `HH:MM:SS` is three characters wider than `HH:MM`, and AIAGE-29 made STOP fill the row. Confirm no wrap.
2. **`AutoStackSheet` over `EntrySheet`.** Stop a timer that overlaps while the edit sheet is open — the auto-stack sheet (`z-50`) must cover the entry sheet (`z-40`).
3. **Export dialog popover.** Open `/reports` → Export, click the person MultiSelect. The `z-[60]` popover must render above `ConfirmModal`'s `z-50` panel and stay clickable.
4. **Coolify scheduled task.** After deploy, set `CRON_SECRET` and register the daily task from ADR-0011's follow-ups. Trigger once by hand and confirm `{ purged: n }`.

## Known scope boundaries

Deliberately **not** done here, recorded so the next reader does not think they were missed:

- **Five duplicate duration formatters remain** (`formatDurationHMS`, `fmtDur`, `fmtDurationHM`, `fmtHM`, `report-pdf.ts`'s private `hm`), producing five different strings: `01:01:01`, `2h 48m`, `05:07`, `5h 07m`, `2 h 48 min`. Task 2's leaf module sets up a future unification. `apps/web/tests/e2e/time-entry-edit.spec.ts:45` hard-asserts `"1h 0m"` and is the tripwire.
- **The audit immutability grep is narrower than it looks.** `audit.test.ts:149-181` walks only `src/lib/services/` and `src/server/mcp/`. Code in `src/lib/actions/` or a route handler could call `auditLog.update()` unnoticed.
- **The audit log's `before`/`after` snapshots are still not rendered.** `AuditRowDto` fetches them; `audit/page.tsx` discards them. Surfacing them was offered during brainstorming and explicitly declined in favour of the trash-side fixes.
- **`purgeOldDeleted` is not transactional** — see ADR-0011's Negative consequences.
