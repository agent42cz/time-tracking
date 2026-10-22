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
  const u = await tx.user.create({ data: { email: `ce-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `CE ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

const HOUR = 3_600_000;

describe('mcp tool: create_entry', () => {
  it('US-114: creates a completed entry for a past window, audits with source=mcp', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '114');
      const client = await tx.client.create({ data: { companyId: w.companyId, name: 'Klient' } });
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'create_entry',
          arguments: {
            startedAt: '2026-01-15T09:40:00+01:00',
            endedAt: '2026-01-15T12:25:00+01:00',
            title: 'logged after the fact',
            description: 'detail text',
            clientId: client.id,
          },
        });
        expect(out.isError).toBeFalsy();
        const { id } = out.structuredContent as { id: string };

        const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
        expect(entry.startedAt.toISOString()).toBe('2026-01-15T08:40:00.000Z');
        expect(entry.endedAt?.toISOString()).toBe('2026-01-15T11:25:00.000Z');
        // MCP `title` maps to the DB `description` column, MCP `description` to `note`.
        expect(entry.description).toBe('logged after the fact');
        expect(entry.note).toBe('detail text');
        expect(entry.clientId).toBe(client.id);
        expect(entry.userId).toBe(w.userId);

        expect(await tx.auditLog.count()).toBe(before + 1);
        const audit = await tx.auditLog.findFirstOrThrow({
          where: { entityType: 'TimeEntry', entityId: id },
        });
        expect(audit.source).toBe('mcp');
        expect(audit.action).toBe('create');
        expect(audit.actorUserId).toBe(w.userId);
      } finally {
        await m.close();
      }
    });
  });

  it('US-114: rejects a reversed or future window with invalid_args and writes nothing', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '114-window');
      const now = Date.now();
      const before = await tx.auditLog.count();
      const entriesBefore = await tx.timeEntry.count({ where: { userId: w.userId } });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const [startedAt, endedAt] of [
          [now - HOUR, now - 2 * HOUR],
          [now - HOUR, now + 24 * HOUR],
        ] as const) {
          const out = await m.client.callTool({
            name: 'create_entry',
            arguments: {
              startedAt: new Date(startedAt).toISOString(),
              endedAt: new Date(endedAt).toISOString(),
            },
          });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'invalid_args' });
        }
      } finally {
        await m.close();
      }

      expect(await tx.auditLog.count()).toBe(before);
      expect(await tx.timeEntry.count({ where: { userId: w.userId } })).toBe(entriesBefore);
    });
  });

  it('US-114: another company or its client returns not_found and writes nothing', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '114-scope');
      const other = await createCompany(tx, { name: 'CE other', createdByUserId: w.userId });
      const otherId = typeof other === 'string' ? other : other.id;
      const otherClient = await tx.client.create({ data: { companyId: otherId, name: 'Cizí' } });
      const window = {
        startedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        endedAt: new Date(Date.now() - HOUR).toISOString(),
      };
      const before = await tx.auditLog.count();

      // Single-company token: the user is a member of `other`, but the token is not.
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const args of [
          { ...window, companyId: otherId },
          { ...window, clientId: otherClient.id },
        ]) {
          const out = await m.client.callTool({ name: 'create_entry', arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }

      expect(await tx.auditLog.count()).toBe(before);
    });
  });
});
