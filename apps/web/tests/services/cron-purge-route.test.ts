/**
 * AIAGE-51 — daily purge cron endpoint.
 * Covers US-96.
 */
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
