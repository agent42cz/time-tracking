import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `ue-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `UE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: update_entry', () => {
  it('US-59: updates description and writes one audit row with source=mcp', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '59');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'old' });
      if (!a.ok) throw new Error('setup');
      const before = await tx.auditLog.count({
        where: { entityType: 'TimeEntry', entityId: a.value.id },
      });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: { entryId: a.value.id, description: 'new' },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const updated = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      expect(updated.description).toBe('new');

      const audits = await tx.auditLog.findMany({
        where: { entityType: 'TimeEntry', entityId: a.value.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.length).toBe(before + 1);
      const last = audits[audits.length - 1]!;
      expect(last.source).toBe('mcp');
      expect(last.action).toBe('update');
    });
  });
});
