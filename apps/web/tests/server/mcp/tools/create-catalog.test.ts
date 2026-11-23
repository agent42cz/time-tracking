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
  const u = await tx.user.create({ data: { email: `cc-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `CC ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tools: create_client / create_project', () => {
  it('US-119: an admin creates a client and a project under it, one audit row each', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '119');
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const c = await m.client.callTool({
          name: 'create_client',
          arguments: { name: '  Svět Plodů  ' },
        });
        expect(c.isError).toBeFalsy();
        const { id: clientId } = c.structuredContent as { id: string };

        const p = await m.client.callTool({
          name: 'create_project',
          arguments: { clientId, name: 'Web' },
        });
        expect(p.isError).toBeFalsy();
        const { id: projectId } = p.structuredContent as { id: string };

        const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
        expect(client).toMatchObject({ companyId: w.companyId, name: 'Svět Plodů' });
        const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        expect(project).toMatchObject({ clientId, name: 'Web' });

        expect(await tx.auditLog.count()).toBe(before + 2);
        const audits = await tx.auditLog.findMany({
          where: { entityId: { in: [clientId, projectId] } },
        });
        for (const [name, args] of [
          ['create_client', { name: 'Svět Plodů' }],
          ['create_project', { clientId, name: 'Web' }],
        ] as const) {
          const dup = await m.client.callTool({ name, arguments: args });
          expect(dup.isError).toBe(true);
          expect(dup.structuredContent).toMatchObject({ code: 'conflict' });
        }

        expect(audits.map((a) => [a.entityType, a.action, a.source]).sort()).toEqual([
          ['Client', 'create', 'mcp'],
          ['Project', 'create', 'mcp'],
        ]);
      } finally {
        await m.close();
      }
    });
  });

  it('US-119: a plain member gets not_found and nothing is created', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '119-member');
      const member = await tx.user.create({ data: { email: 'cc-mem@x.test', fullName: 'M' } });
      await tx.membership.create({
        data: { userId: member.id, companyId: w.companyId, role: 'user' },
      });
      const client = await tx.client.create({ data: { companyId: w.companyId, name: 'Acme' } });
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: member.id, companyId: w.companyId });
      try {
        for (const [name, args] of [
          ['create_client', { name: 'X' }],
          ['create_project', { clientId: client.id, name: 'Y' }],
        ] as const) {
          const out = await m.client.callTool({ name, arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }
      expect(await tx.client.count({ where: { companyId: w.companyId } })).toBe(1);
      expect(await tx.project.count({ where: { clientId: client.id } })).toBe(0);
      expect(await tx.auditLog.count()).toBe(before);
    });
  });

  it("US-119: another company or its client is not_found even for that company's admin", async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '119-scope');
      const other = await createCompany(tx, { name: 'CC other', createdByUserId: w.userId });
      const otherId = typeof other === 'string' ? other : other.id;
      const otherClient = await tx.client.create({ data: { companyId: otherId, name: 'Cizí' } });
      const before = await tx.auditLog.count();

      // Single-company token: the user administers `other`, but the token is not scoped to it.
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        for (const [name, args] of [
          ['create_client', { companyId: otherId, name: 'X' }],
          ['create_project', { clientId: otherClient.id, name: 'Y' }],
        ] as const) {
          const out = await m.client.callTool({ name, arguments: args });
          expect(out.isError).toBe(true);
          expect(out.structuredContent).toMatchObject({ code: 'not_found' });
        }
      } finally {
        await m.close();
      }
      expect(await tx.client.count({ where: { companyId: otherId } })).toBe(1);
      expect(await tx.project.count({ where: { clientId: otherClient.id } })).toBe(0);
      expect(await tx.auditLog.count()).toBe(before);
    });
  });
});
