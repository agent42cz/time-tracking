/**
 * AIAGE-66: the service worker's poll logged 279 identical
 * `poll:error {"message":"Failed to fetch"}` records over ten hours and nothing
 * about where the request went, so the buffer could not distinguish "laptop was
 * asleep" from "an access proxy is bouncing every call". These tests drive
 * `public/background.js` — plain JS, loaded here as a module with the extension
 * globals stubbed, because it cannot import the TypeScript sources (see the
 * header comment in that file).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagRecord } from './diag.js';

interface ChromeStub {
  store: Record<string, unknown>;
  storage: { local: Record<string, unknown> };
  action: Record<string, unknown>;
  alarms: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

function stubChrome(): ChromeStub {
  const store: Record<string, unknown> = {};
  const listeners = { addListener: vi.fn(), removeListener: vi.fn() };
  const chromeStub = {
    store,
    storage: {
      local: {
        get: vi.fn(async (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
        }),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(store, patch);
        }),
        remove: vi.fn(async (key: string | string[]) => {
          for (const k of Array.isArray(key) ? key : [key]) delete store[k];
        }),
      },
      onChanged: listeners,
    },
    action: {
      setIcon: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
    alarms: { create: vi.fn(async () => undefined), onAlarm: listeners },
    runtime: {
      onInstalled: listeners,
      onStartup: listeners,
      onMessage: listeners,
      onMessageExternal: listeners,
    },
  };
  return chromeStub as unknown as ChromeStub;
}

/** Import background.js fresh, with its top-level `poll()` allowed to settle. */
async function runWorker(): Promise<void> {
  vi.resetModules();
  // @ts-expect-error — plain JS with no declaration file, on purpose: public/
  // is copied verbatim by Vite and must not be pulled into the TS program.
  await import('../public/background.js');
  // Two macrotask turns: loadSession -> fetch -> diag write.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function diagRecords(chromeStub: ChromeStub): DiagRecord[] {
  return (chromeStub.store['tt:diag'] as DiagRecord[] | undefined) ?? [];
}

let chromeStub: ChromeStub;

beforeEach(() => {
  chromeStub = stubChrome();
  chromeStub.store['tt:session'] = {
    token: 'tok',
    expiresAt: '2099-01-01T00:00:00.000Z',
    apiBase: 'https://tracker.agent42.cz',
  };
  vi.stubGlobal('chrome', chromeStub);
  vi.stubGlobal('crypto', { randomUUID: () => 'sw-instance' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('service worker poll behind an access proxy', () => {
  it('US-104: a redirected poll is logged as poll:blocked with the URL it was refused at', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ type: 'opaqueredirect', status: 0, ok: false })),
    );

    await runWorker();

    const blocked = diagRecords(chromeStub).find((r) => r.event === 'poll:blocked');
    expect(blocked).toBeDefined();
    expect(blocked?.data).toMatchObject({ url: 'https://tracker.agent42.cz/api/v1/timer' });
  });

  it('US-104: a genuine transport failure still logs poll:error, now naming the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await runWorker();

    const failed = diagRecords(chromeStub).find((r) => r.event === 'poll:error');
    expect(failed?.data).toMatchObject({
      message: 'Failed to fetch',
      url: 'https://tracker.agent42.cz/api/v1/timer',
    });
  });

  it('US-104: a successful poll still reports the running count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        type: 'basic',
        status: 200,
        ok: true,
        json: async () => ({ running: [{ id: 'a' }, { id: 'b' }] }),
      })),
    );

    await runWorker();

    const result = diagRecords(chromeStub).find((r) => r.event === 'poll:result');
    expect(result?.data).toMatchObject({ running: 2 });
  });
});
