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

  it('US-19: persists the separate note field on a manual entry', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const user = await tx.user.create({ data: { email: 'mn-n@x.test', fullName: 'U' } });
      const company = await createCompany(tx, { name: 'Mn Co Note', createdByUserId: user.id });
      ctx.userId = user.id;
      ctx.active = { companyId: company.id, role: 'admin' };

      const res = await POST(
        postReq({
          description: 'Manual work',
          note: 'a longer note',
          startedAt: '2026-05-10T08:00:00.000Z',
          endedAt: '2026-05-10T10:00:00.000Z',
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id: string };
      const created = await tx.timeEntry.findUnique({ where: { id: json.id } });
      expect(created?.note).toBe('a longer note');
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
