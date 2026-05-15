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
  const u = await tx.user.create({ data: { email: `st-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `ST ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: start_timer', () => {
  it('US-58: starts a timer, audits with source=mcp, returns entry id', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '58');
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'start_timer',
          arguments: { description: 'driving from MCP' },
        });
        expect(out.isError).toBeFalsy();
        const { id } = out.structuredContent as { id: string };

        const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
        expect(entry.endedAt).toBeNull();
        expect(entry.description).toBe('driving from MCP');

        const after = await tx.auditLog.count();
        expect(after).toBe(before + 1);
        const audit = await tx.auditLog.findFirstOrThrow({
          where: { entityType: 'TimeEntry', entityId: id },
        });
        expect(audit.source).toBe('mcp');
        expect(audit.actorUserId).toBe(w.userId);
      } finally {
        await m.close();
      }
    });
  });
});
