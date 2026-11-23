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
  it('US-59: updates the title and writes one audit row with source=mcp', async () => {
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
          arguments: { entryId: a.value.id, title: 'new' },
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

  it('US-24: sets the separate description (note) field', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'note');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'old' });
      if (!a.ok) throw new Error('setup');

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: { entryId: a.value.id, description: 'detail text' },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const updated = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      // MCP `description` maps to the DB `note` column (the longer free-text detail).
      expect(updated.note).toBe('detail text');
      // The title (DB `description` column) is untouched — it is a parallel field.
      expect(updated.description).toBe('old');
    });
  });
  it('US-118: moves startedAt/endedAt of a stopped entry with one audit row', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '118');
      const e = await tx.timeEntry.create({
        data: {
          userId: w.userId,
          companyId: w.companyId,
          startedAt: new Date('2026-10-01T07:00:00Z'),
          endedAt: new Date('2026-10-01T08:00:00Z'),
        },
      });
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: {
            entryId: e.id,
            startedAt: '2026-10-01T10:00:00+02:00',
            endedAt: '2026-10-01T11:30:00+02:00',
          },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const updated = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
      expect(updated.startedAt.toISOString()).toBe('2026-10-01T08:00:00.000Z');
      expect(updated.endedAt?.toISOString()).toBe('2026-10-01T09:30:00.000Z');
      expect(await tx.auditLog.count()).toBe(before + 1);
      const audit = await tx.auditLog.findFirstOrThrow({
        where: { entityType: 'TimeEntry', entityId: e.id, action: 'update' },
      });
      expect(audit.source).toBe('mcp');
    });
  });

  it('US-118: an end before the start or in the future is invalid_args and writes nothing', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '118-bad');
      const e = await tx.timeEntry.create({
        data: {
          userId: w.userId,
          companyId: w.companyId,
          startedAt: new Date('2026-10-01T07:00:00Z'),
          endedAt: new Date('2026-10-01T08:00:00Z'),
        },
      });
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const endedAt of [
          '2026-10-01T06:00:00Z',
          new Date(Date.now() + 24 * 3_600_000).toISOString(),
        ]) {
          const out = await m.client.callTool({
            name: 'update_entry',
            arguments: { entryId: e.id, endedAt },
          });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'invalid_args' });
        }
      } finally {
        await m.close();
      }

      const unchanged = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.id } });
      expect(unchanged.endedAt?.toISOString()).toBe('2026-10-01T08:00:00.000Z');
      expect(await tx.auditLog.count()).toBe(before);
    });
  });
});
