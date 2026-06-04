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

  it('US-24: owner sets the separate note field', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'ed-n@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Ed Co Note', createdByUserId: user.id });
      const started = await startTimer(tx, user.id, { companyId: company.id, description: 'orig' });
      if (!started.ok) throw new Error('setup');
      ctx.userId = user.id;

      const res = await PATCH(patchReq(started.value.id, { note: 'x' }), params(started.value.id));
      expect(res.status).toBe(200);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: started.value.id } });
      expect(reread.note).toBe('x');
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

  it('returns 400 when note exceeds the 5000-char cap', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'ed-long@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Ed Co Long', createdByUserId: user.id });
      const started = await startTimer(tx, user.id, { companyId: company.id, description: 'orig' });
      if (!started.ok) throw new Error('setup');
      ctx.userId = user.id;

      const res = await PATCH(
        patchReq(started.value.id, { note: 'x'.repeat(5001) }),
        params(started.value.id),
      );
      expect(res.status).toBe(400);
    });
  });
});
