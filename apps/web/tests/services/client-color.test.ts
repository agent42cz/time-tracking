/**
 * Client colour (US-102).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';
import { createClient, updateClientColor } from '../../src/lib/services/catalog.js';
import { createCompany } from '../../src/lib/services/companies.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  outsider: string;
  company: string;
}

async function seedWorld(
  tx: Prisma.TransactionClient,
  suffix = Math.random().toString(36).slice(2),
): Promise<World> {
  const admin = await tx.user.create({
    data: { email: `cc-admin-${suffix}@example.test`, fullName: 'A' },
  });
  const user = await tx.user.create({
    data: { email: `cc-user-${suffix}@example.test`, fullName: 'U' },
  });
  const outsider = await tx.user.create({
    data: { email: `cc-out-${suffix}@example.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Cc ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  // outsider has no membership in this company
  await createCompany(tx, { name: `Other ${suffix}`, createdByUserId: outsider.id });
  return { admin: admin.id, user: user.id, outsider: outsider.id, company: company.id };
}

async function auditCount(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  return tx.auditLog.count({ where: { companyId } });
}

describe('client colour', () => {
  it('US-102: an admin sets a client colour and it writes exactly one audit row', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const before = await auditCount(tx, w.company);

      const res = await updateClientColor(tx, w.admin, c.value.id, CLIENT_COLORS[0]!.light);

      expect(res).toEqual({ ok: true, value: true });
      const row = await tx.client.findUnique({ where: { id: c.value.id } });
      expect(row?.color).toBe(CLIENT_COLORS[0]!.light);
      expect((await auditCount(tx, w.company)) - before).toBe(1);
    });
  });

  it('US-102: a new client starts at the neutral default', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const row = await tx.client.findUnique({ where: { id: c.value.id } });
      expect(row?.color).toBe(DEFAULT_CLIENT_COLOR);
    });
  });

  it('US-102: a non-admin member cannot set a colour', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const res = await updateClientColor(tx, w.user, c.value.id, CLIENT_COLORS[1]!.light);
      expect(res).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-102: an actor from another company gets not_found, not a permission error', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const res = await updateClientColor(tx, w.outsider, c.value.id, CLIENT_COLORS[1]!.light);
      expect(res).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-102: an off-palette colour is rejected and writes no audit row', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const before = await auditCount(tx, w.company);

      const res = await updateClientColor(tx, w.admin, c.value.id, '#123456');

      expect(res).toEqual({ ok: false, reason: 'invalid' });
      expect(await auditCount(tx, w.company)).toBe(before);
    });
  });
});
