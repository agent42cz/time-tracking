import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer, stopTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lre-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LRE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: list_recent_entries', () => {
  it('returns up to limit, most recent first', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'lre');
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await startTimer(tx, w.userId, {
          companyId: w.companyId,
          description: `e${i}`,
        });
        if (!r.ok) throw new Error('setup');
        ids.push(r.value.id);
        await stopTimer(tx, w.userId, r.value.id);
      }
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'list_recent_entries',
          arguments: { limit: 2 },
        });
        expect(out.isError).toBeFalsy();
        const entries = (out.structuredContent as { entries: { id: string }[] }).entries;
        expect(entries.map((e) => e.id)).toEqual([ids[2], ids[1]]);
      } finally {
        await m.close();
      }
    });
  });

  it('caps limit at 50 and truncates description to 500 chars', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'cap');
      const long = 'x'.repeat(1000);
      const r = await startTimer(tx, w.userId, { companyId: w.companyId, description: long });
      if (!r.ok) throw new Error('setup');
      await stopTimer(tx, w.userId, r.value.id);

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'list_recent_entries',
          arguments: { limit: 999 },
        });
        // limit > 50 should NOT be rejected by Zod (server caps it). Adjust if your
        // Zod input schema rejects values >50 — see note below.
        expect(out.isError).toBeFalsy();
        const entries = (out.structuredContent as { entries: { description: string }[] }).entries;
        expect(entries[0]!.description.length).toBe(500);
      } finally {
        await m.close();
      }
    });
  });
});
