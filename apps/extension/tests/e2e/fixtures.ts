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
 * `01:01:01` once seconds are restored (US-92).
 * `historyCount` defaults to 25 — enough rows to make the 600px-tall popup
 * scroll, which US-99 depends on.
 * `running` defaults to `true` (one seeded running entry, matching prior
 * behaviour). Pass `false` to model an idle popup with no running timer —
 * needed to exercise the tick-gating-on-`hasRunning` codepath (US-92).
 */
export function buildApiFixture(
  opts: { runningStartedAt?: string; historyCount?: number; running?: boolean } = {},
): ApiFixture {
  const now = Date.now();
  const runningStartedAt = opts.runningStartedAt ?? new Date(now - 3_661_000).toISOString();
  const historyCount = opts.historyCount ?? 25;
  const includeRunning = opts.running ?? true;

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
      memberships: [
        { companyId: COMPANY_ID, companyName: 'E2E Co', companySlug: 'e2e-co', role: 'admin' },
      ],
      // null => sync.ts:158 returns early, no WebSocket in tests.
      wsUrl: null,
      autoStackOverlaps: false,
    },
    catalog: {
      companyId: COMPANY_ID,
      clients: [{ id: 'cli-1', name: 'Klient A', projects: [{ id: 'prj-1', name: 'Projekt A' }] }],
      tags: [],
    },
    timer: {
      companyId: COMPANY_ID,
      running: includeRunning
        ? [
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
          ]
        : [],
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
