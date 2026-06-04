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
