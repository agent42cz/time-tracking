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

  it('US-88: setting OFF returns overlap: null even when entries overlap', async () => {
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
