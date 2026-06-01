/** Phase 12 — PDF export route. Covers US-78 (incl. mandatory cross-company 404). */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { setNowProvider } from '@tt/shared/time';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient, createProject } from '../../src/lib/services/catalog.js';

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
// Stub next-intl so the route doesn't need request context; returns the key.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

// Import the route AFTER the mocks are registered.
const { GET } = await import('../../src/app/api/reports/export.pdf/route.js');

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
  return new NextRequest(`http://localhost/api/reports/export.pdf?${qs}`);
}

describe('GET /api/reports/export.pdf', () => {
  it('US-78: exports last month as a PDF', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'pdf-a@x.test', fullName: 'A' } });
      const company = await createCompany(tx, { name: 'PDF Co', createdByUserId: admin.id });
      const client = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      const project = await createProject(tx, admin.id, { clientId: client.value.id, name: 'Web' });
      if (!project.ok) throw new Error('setup');
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          clientId: client.value.id,
          projectId: project.value.id,
          description: 'Práce v květnu',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T11:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

      const res = await GET(reqUrl('preset=lastMonth&groupBy=project'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('vykaz-2026-05.pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  it('US-78: returns 404 when the active company is one the user does not belong to', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'pdf-o@x.test', fullName: 'O' } });
      const founder = await tx.user.create({ data: { email: 'pdf-f@x.test', fullName: 'F' } });
      const foreign = await createCompany(tx, { name: 'Foreign', createdByUserId: founder.id });
      // Outsider has no membership in `foreign` but the session claims it active.
      ctx.session = { userId: outsider.id, activeCompanyId: foreign.id, activeRole: 'admin' };

      const res = await GET(reqUrl('preset=lastMonth'));
      expect(res.status).toBe(404);
    });
  });
});
