import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer, stopTimer, updateEntry } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lr-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LR ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: list_running_entries', () => {
  it('US-57: returns only entries with endedAt null, in startedAt asc order', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '57');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'A' });
      const b = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'B' });
      if (!a.ok || !b.ok) throw new Error('setup');
      await stopTimer(tx, w.userId, a.value.id);
      await updateEntry(tx, w.userId, b.value.id, { note: 'running note' });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({ name: 'list_running_entries', arguments: {} });
        expect(out.isError).toBeFalsy();
        expect(out.structuredContent).toMatchObject({
          entries: [{ id: b.value.id, description: 'B', note: 'running note' }],
        });
      } finally {
        await m.close();
      }
    });
  });
});
