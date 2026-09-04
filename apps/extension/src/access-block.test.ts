/**
 * AIAGE-66: `tracker.agent42.cz` was put behind Cloudflare Access, which answers
 * every unauthenticated request with a 302 to `*.cloudflareaccess.com`. That host
 * is not in the manifest's host_permissions, so Chrome kills the redirected fetch
 * with a bare `TypeError: Failed to fetch` — indistinguishable, to the old code,
 * from being offline. The popup then queued every start instead of reporting the
 * outage, and the service worker logged 279 identical `poll:error` records with
 * no clue about where the request had gone.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  AccessBlockedError,
  ApiError,
  getTimer,
  isAccessRedirect,
  type ApiSession,
} from './api.js';
import { isNetworkError } from './sync.js';

const session: ApiSession = {
  token: 'tok',
  expiresAt: '2099-01-01T00:00:00.000Z',
  apiBase: 'https://tracker.agent42.cz',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** What `fetch(..., { redirect: 'manual' })` returns when a cross-origin 302 is refused. */
function opaqueRedirect(): Response {
  return { type: 'opaqueredirect', status: 0, ok: false } as Response;
}

describe('isAccessRedirect', () => {
  it('US-34: an opaque redirect response is recognised as a blocked request', () => {
    expect(isAccessRedirect(opaqueRedirect())).toBe(true);
  });

  it('US-34: a normal response is not a blocked request', () => {
    expect(isAccessRedirect({ type: 'basic', status: 200, ok: true } as Response)).toBe(false);
  });
});

describe('API calls behind Cloudflare Access', () => {
  it('US-34: a redirected request throws AccessBlockedError naming the URL, not a bare network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => opaqueRedirect()),
    );

    await expect(getTimer(session)).rejects.toBeInstanceOf(AccessBlockedError);
    await expect(getTimer(session)).rejects.toMatchObject({
      url: 'https://tracker.agent42.cz/api/v1/timer',
    });
  });

  it('US-34: requests are sent with redirect:manual so the cross-origin hop never throws', async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) => opaqueRedirect());
    vi.stubGlobal('fetch', spy);

    await expect(getTimer(session)).rejects.toBeInstanceOf(AccessBlockedError);
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('US-34: an ordinary HTTP error still throws ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        type: 'basic',
        status: 401,
        ok: false,
        json: async () => ({ error: 'unauthorized' }),
      })),
    );

    await expect(getTimer(session)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('isNetworkError', () => {
  it('US-34: a blocked request is not offline, so the mutation is not queued', () => {
    expect(isNetworkError(new AccessBlockedError('https://tracker.agent42.cz/api/v1/timer'))).toBe(
      false,
    );
  });

  it('US-34: a genuine fetch failure is still offline and still queues', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('US-34: an API error is not offline', () => {
    expect(isNetworkError(new ApiError(409, 'conflict'))).toBe(false);
  });
});
