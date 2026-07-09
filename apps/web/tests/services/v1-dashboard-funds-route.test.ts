/** v1 GET /dashboard/funds — admin-only client work-fund progress (AIAGE-52). Covers US-90 + cross-company 404. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient, updateClientFund } from '../../src/lib/services/catalog.js';

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

const { GET } = await import('../../src/app/api/v1/dashboard/funds/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/v1/dashboard/funds', { method: 'GET' });
}

describe('GET /api/v1/dashboard/funds', () => {
  it('US-90: admin gets fund progress; non-admin and cross-company get 404', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'fd-a@x.test', fullName: 'A' } });
      const member = await tx.user.create({ data: { email: 'fd-m@x.test', fullName: 'M' } });
      const company = await createCompany(tx, { name: 'Fund Co', createdByUserId: admin.id });
      await tx.membership.create({
        data: { userId: member.id, companyId: company.id, role: 'user' },
      });

      const outsiderAdmin = await tx.user.create({ data: { email: 'fd-o@x.test', fullName: 'O' } });
      await createCompany(tx, { name: 'Outsider Co', createdByUserId: outsiderAdmin.id });

      const client = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      const patched = await updateClientFund(tx, admin.id, client.value.id, {
        fundInDashboard: true,
        weeklyFundMinutes: 600,
        weekStartsOn: 1,
        workingDays: [1, 2, 3, 4, 5],
      });
      if (!patched.ok) throw new Error('setup: fund patch');

      // admin gets fund progress
      ctx.userId = admin.id;
      ctx.active = { companyId: company.id, role: 'admin' };
      const adminRes = await GET(getReq());
      expect(adminRes.status).toBe(200);
      const adminJson = (await adminRes.json()) as { clients: unknown[] };
      expect(adminJson.clients.length).toBeGreaterThanOrEqual(1);

      // plain member gets 404 (no existence leak)
      ctx.userId = member.id;
      ctx.active = { companyId: company.id, role: 'user' };
      const userRes = await GET(getReq());
      expect(userRes.status).toBe(404);

      // outsider admin scoped to the first company gets 404
      ctx.userId = outsiderAdmin.id;
      ctx.active = { companyId: company.id, role: 'admin' };
      const otherRes = await GET(getReq());
      expect(otherRes.status).toBe(404);
    });
  });
});
