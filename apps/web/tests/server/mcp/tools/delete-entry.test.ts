import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `de-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `DE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

function entryIn(tx: Prisma.TransactionClient, userId: string, companyId: string) {
  return tx.timeEntry.create({
    data: {
      userId,
      companyId,
      startedAt: new Date('2026-10-01T07:00:00Z'),
      endedAt: new Date('2026-10-01T08:00:00Z'),
    },
  });
}

describe('mcp tool: delete_entry', () => {
  it('US-117: moves the entry to the trash with one delete audit row (source=mcp)', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '117');
      const e = await entryIn(tx, w.userId, w.companyId);
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({ name: 'delete_entry', arguments: { entryId: e.id } });
        expect(out.isError).toBeFalsy();

        const again = await m.client.callTool({
          name: 'delete_entry',
          arguments: { entryId: e.id },
        });
        expect(again.isError).toBe(true);
        expect(again.structuredContent).toMatchObject({ code: 'not_found' });
      } finally {
        await m.close();
      }

      const row = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(await tx.auditLog.count()).toBe(before + 1);
      const audit = await tx.auditLog.findFirstOrThrow({
        where: { entityType: 'TimeEntry', entityId: e.id },
      });
      expect(audit).toMatchObject({ action: 'delete', source: 'mcp', actorUserId: w.userId });
    });
  });

  it("US-117: another company's or a colleague's entry is not_found and stays", async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '117-scope');
      const colleague = await tx.user.create({ data: { email: 'de-col@x.test', fullName: 'C' } });
      await tx.membership.create({
        data: { userId: colleague.id, companyId: w.companyId, role: 'user' },
      });
      const colleagues = await entryIn(tx, colleague.id, w.companyId);
      const other = await createCompany(tx, { name: 'DE other', createdByUserId: w.userId });
      const otherId = typeof other === 'string' ? other : other.id;
      const foreign = await entryIn(tx, w.userId, otherId);
      const before = await tx.auditLog.count();

      // Single-company token: the user is a member (and admin) of `other`, the token is not.
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const id of [colleagues.id, foreign.id]) {
          const out = await m.client.callTool({ name: 'delete_entry', arguments: { entryId: id } });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }

      for (const id of [colleagues.id, foreign.id]) {
        const row = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
        expect(row.deletedAt).toBeNull();
      }
      expect(await tx.auditLog.count()).toBe(before);
    });
  });
});
