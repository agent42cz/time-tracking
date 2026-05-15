import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../src/lib/services/companies.js';
import { startTimer } from '../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function twoCompanies(tx: Prisma.TransactionClient, suffix: string) {
  const ua = await tx.user.create({ data: { email: `xc-a-${suffix}@x.test`, fullName: 'A' } });
  const ub = await tx.user.create({ data: { email: `xc-b-${suffix}@x.test`, fullName: 'B' } });
  const ca = await createCompany(tx, { name: `A ${suffix}`, createdByUserId: ua.id });
  const cb = await createCompany(tx, { name: `B ${suffix}`, createdByUserId: ub.id });
  return {
    ua: ua.id,
    ub: ub.id,
    ca: typeof ca === 'string' ? ca : ca.id,
    cb: typeof cb === 'string' ? cb : cb.id,
  };
}

describe('mcp cross-company not_found', () => {
  it('US-61: stop_timer for Company A entry returns not_found from a Company B token', async () => {
    await withTx(async (tx) => {
      const w = await twoCompanies(tx, 's');
      const a = await startTimer(tx, w.ua, { companyId: w.ca, description: 'A1' });
      if (!a.ok) throw new Error('setup');
      const m = await buildInProcessMcp({ db: tx, userId: w.ub, companyId: w.cb });
      try {
        const out = await m.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('not_found');
        const errBody = JSON.parse(
          (out.content as { type: 'text'; text: string }[])[0]?.text ?? '{}',
        ) as { message?: string };
        expect(errBody.message ?? '').not.toMatch(/forbidden|permission/i);
      } finally {
        await m.close();
      }
    });
  });

  it('US-61: update_entry for Company A entry returns not_found from a Company B token', async () => {
    await withTx(async (tx) => {
      const w = await twoCompanies(tx, 'u');
      const a = await startTimer(tx, w.ua, { companyId: w.ca });
      if (!a.ok) throw new Error('setup');
      const m = await buildInProcessMcp({ db: tx, userId: w.ub, companyId: w.cb });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: { entryId: a.value.id, description: 'x' },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('not_found');
      } finally {
        await m.close();
      }
    });
  });
});
