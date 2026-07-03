/** Phase 12 — CSV export route. Covers US-89 member scoping + mandatory cross-company 404. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { setNowProvider } from '@tt/shared/time';
import { createCompany } from '../../src/lib/services/companies.js';

// Mutable holder the mocked session reads from (vi.mock factories are hoisted).
const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  session: null as unknown as {
    userId: string;
    activeCompanyId: string;
    activeRole: 'admin' | 'user';
  },
}));

vi.mock('@/lib/session', () => ({
  prisma: () => ctx.db,
  requireActiveCompany: async () => ctx.session,
}));

// Import the route AFTER the mock is registered.
const { GET } = await import('../../src/app/api/reports/export.csv/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
  setNowProvider(null);
});
beforeEach(() => {
  setNowProvider(() => new Date('2026-06-01T10:00:00Z'));
});

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/reports/export.csv?${qs}`);
}

describe('GET /api/reports/export.csv', () => {
  it('US-89: scopes the CSV to the selected member only', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'csv-a@x.test', fullName: 'Admin A' } });
      const company = await createCompany(tx, { name: 'CSV Co', createdByUserId: admin.id });
      const bob = await tx.user.create({ data: { email: 'csv-b@x.test', fullName: 'Bob B' } });
      await tx.membership.create({ data: { userId: bob.id, companyId: company.id, role: 'user' } });
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          description: 'ADMIN_WORK',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T09:00:00Z'),
        },
      });
      await tx.timeEntry.create({
        data: {
          userId: bob.id,
          companyId: company.id,
          description: 'BOB_WORK',
          startedAt: new Date('2026-05-11T08:00:00Z'),
          endedAt: new Date('2026-05-11T09:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&member=${bob.id}`));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('BOB_WORK');
      expect(body).not.toContain('ADMIN_WORK');
    });
  });

  it('US-89: returns 404 when the active company is one the user does not belong to', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'csv-o@x.test', fullName: 'Out' } });
      const founder = await tx.user.create({ data: { email: 'csv-f@x.test', fullName: 'Fnd' } });
      const foreign = await createCompany(tx, { name: 'Foreign CSV', createdByUserId: founder.id });
      ctx.session = { userId: outsider.id, activeCompanyId: foreign.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&member=${founder.id}`));
      expect(res.status).toBe(404);
    });
  });
});
