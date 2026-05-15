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
  const u = await tx.user.create({ data: { email: `sp-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `SP ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: stop_timer', () => {
  it('US-60: stops the targeted entry; leaves another running one alone', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '60');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'a' });
      const b = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'b' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const ea = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      const eb = await tx.timeEntry.findUniqueOrThrow({ where: { id: b.value.id } });
      expect(ea.endedAt).not.toBeNull();
      expect(eb.endedAt).toBeNull();

      const after = await tx.auditLog.count();
      expect(after).toBe(before + 1);
    });
  });

  it('returns conflict if the entry is already stopped', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'ns');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId });
      if (!a.ok) throw new Error('setup');
      const m1 = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        await m1.client.callTool({ name: 'stop_timer', arguments: { entryId: a.value.id } });
        const out = await m1.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('conflict');
      } finally {
        await m1.close();
      }
    });
  });
});
