/** Tests for getEntryEditContextAction authorization. Covers US-24 (edit context). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient, createProject } from '../../src/lib/services/catalog.js';
import { startTimer } from '../../src/lib/services/time-entries.js';

// Mutable holder that the mocked session reads from (vi.mock factories are hoisted).
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

// Stub next/cache so the server action module can be imported under vitest.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// Import the action AFTER mocks are registered.
const { getEntryEditContextAction } = await import('../../src/lib/actions/time.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

describe('getEntryEditContextAction', () => {
  it('US-24: owner (admin) receives full edit context', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;

      const admin = await tx.user.create({
        data: { email: 'geeca-owner@x.test', fullName: 'Owner' },
      });
      const company = await createCompany(tx, {
        name: 'GEECA Co',
        createdByUserId: admin.id,
      });
      const clientResult = await createClient(tx, admin.id, {
        companyId: company.id,
        name: 'Acme',
      });
      if (!clientResult.ok) throw new Error('setup: createClient');
      const projectResult = await createProject(tx, admin.id, {
        clientId: clientResult.value.id,
        name: 'Web',
      });
      if (!projectResult.ok) throw new Error('setup: createProject');

      const timerResult = await startTimer(tx, admin.id, {
        companyId: company.id,
        description: 'Working on feature',
        clientId: clientResult.value.id,
        projectId: projectResult.value.id,
      });
      if (!timerResult.ok) throw new Error('setup: startTimer');

      ctx.session = {
        userId: admin.id,
        activeCompanyId: company.id,
        activeRole: 'admin',
      };

      const res = await getEntryEditContextAction(timerResult.value.id);

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.entry.description).toBe('Working on feature');
      expect(res.data.entry.clientId).toBe(clientResult.value.id);
      expect(res.data.entry.projectId).toBe(projectResult.value.id);
      expect(Array.isArray(res.data.entry.tagIds)).toBe(true);
      expect(res.data.entry.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.data.entry.endedAt).toBeNull();

      const returnedClient = res.data.clients.find((c) => c.id === clientResult.value.id);
      expect(returnedClient).toBeDefined();
      expect(returnedClient?.name).toBe('Acme');
      expect(returnedClient?.projects.some((p) => p.id === projectResult.value.id)).toBe(true);

      expect(Array.isArray(res.data.tags)).toBe(true);
    });
  });

  it('US-24: cross-company entry returns ok:false without throwing', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;

      // Company A — entry owner.
      const ownerA = await tx.user.create({
        data: { email: 'geeca-cross-a@x.test', fullName: 'OwnerA' },
      });
      const companyA = await createCompany(tx, {
        name: 'GEECA CompanyA',
        createdByUserId: ownerA.id,
      });
      const timerResult = await startTimer(tx, ownerA.id, {
        companyId: companyA.id,
        description: 'Secret work',
      });
      if (!timerResult.ok) throw new Error('setup: startTimer');

      // Company B — a different company; session claims it as active.
      const ownerB = await tx.user.create({
        data: { email: 'geeca-cross-b@x.test', fullName: 'OwnerB' },
      });
      const companyB = await createCompany(tx, {
        name: 'GEECA CompanyB',
        createdByUserId: ownerB.id,
      });

      ctx.session = {
        userId: ownerA.id,
        activeCompanyId: companyB.id,
        activeRole: 'admin',
      };

      const res = await getEntryEditContextAction(timerResult.value.id);

      expect(res.ok).toBe(false);
    });
  });

  it('US-24: non-owner non-admin member returns ok:false', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;

      const owner = await tx.user.create({
        data: { email: 'geeca-nonowner-o@x.test', fullName: 'Owner' },
      });
      const member = await tx.user.create({
        data: { email: 'geeca-nonowner-m@x.test', fullName: 'Member' },
      });
      const company = await createCompany(tx, {
        name: 'GEECA NonOwner Co',
        createdByUserId: owner.id,
      });
      await tx.membership.create({
        data: { userId: member.id, companyId: company.id, role: 'user' },
      });

      const timerResult = await startTimer(tx, owner.id, {
        companyId: company.id,
        description: 'Owners private entry',
      });
      if (!timerResult.ok) throw new Error('setup: startTimer');

      // member is NOT the owner and has role 'user' (not admin).
      ctx.session = {
        userId: member.id,
        activeCompanyId: company.id,
        activeRole: 'user',
      };

      const res = await getEntryEditContextAction(timerResult.value.id);

      expect(res.ok).toBe(false);
    });
  });
});
