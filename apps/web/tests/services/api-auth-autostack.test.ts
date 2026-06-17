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
  it('US-87: includes the user autoStackOverlaps setting', async () => {
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
