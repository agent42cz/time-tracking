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

  it('US-113: scopes the CSV to the selected project only', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({
        data: { email: 'csv-p-a@x.test', fullName: 'Admin P' },
      });
      const company = await createCompany(tx, { name: 'Proj CSV', createdByUserId: admin.id });
      const client = await tx.client.create({ data: { companyId: company.id, name: 'Klient' } });
      const alpha = await tx.project.create({ data: { clientId: client.id, name: 'Alpha' } });
      const beta = await tx.project.create({ data: { clientId: client.id, name: 'Beta' } });
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          clientId: client.id,
          projectId: alpha.id,
          description: 'ALPHA_WORK',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T09:00:00Z'),
        },
      });
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          clientId: client.id,
          projectId: beta.id,
          description: 'BETA_WORK',
          startedAt: new Date('2026-05-11T08:00:00Z'),
          endedAt: new Date('2026-05-11T09:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&project=${alpha.id}`));
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('ALPHA_WORK');
      expect(body).not.toContain('BETA_WORK');
    });
  });

  it('US-113: returns 404 when the project belongs to another company', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'csv-p-o@x.test', fullName: 'Home' } });
      const home = await createCompany(tx, { name: 'Home CSV', createdByUserId: admin.id });
      const founder = await tx.user.create({
        data: { email: 'csv-p-f@x.test', fullName: 'Other' },
      });
      const foreign = await createCompany(tx, { name: 'Other CSV', createdByUserId: founder.id });
      const client = await tx.client.create({ data: { companyId: foreign.id, name: 'Cizí' } });
      const project = await tx.project.create({
        data: { clientId: client.id, name: 'Cizí projekt' },
      });
      await tx.timeEntry.create({
        data: {
          userId: founder.id,
          companyId: foreign.id,
          clientId: client.id,
          projectId: project.id,
          description: 'FOREIGN_WORK',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T09:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: home.id, activeRole: 'admin' };

      const res = await GET(reqUrl(`from=2026-05-01&to=2026-06-01&project=${project.id}`));
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('FOREIGN_WORK');
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
