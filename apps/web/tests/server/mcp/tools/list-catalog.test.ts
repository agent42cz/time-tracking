import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { createClient, createProject } from '../../../../src/lib/services/catalog.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lc-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LC ${suffix}`, createdByUserId: u.id });
  const companyId = typeof c === 'string' ? c : c.id;
  return { userId: u.id, companyId };
}

describe('mcp tool: list_catalog', () => {
  it('returns clients/projects filtered by query', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'lc');
      const c = await createClient(tx, w.userId, { companyId: w.companyId, name: 'Acme' });
      if (!c.ok) throw new Error('setup');
      await createProject(tx, w.userId, { clientId: c.value.id, name: 'Web' });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const c1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'clients' },
        });
        expect(
          (c1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('Acme');

        const p1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'projects' },
        });
        expect(
          (p1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('Web');
      } finally {
        await m.close();
      }
    });
  });

  it('US-18: no longer advertises a "tags" kind (tags removed from the MCP surface)', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'notags');
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const { tools } = await m.client.listTools();
        const tool = tools.find((t) => t.name === 'list_catalog');
        expect(tool).toBeDefined();
        const kindProp = (tool?.inputSchema as { properties?: { kind?: { enum?: string[] } } })
          .properties?.kind;
        expect(kindProp?.enum).toEqual(['clients', 'projects']);
      } finally {
        await m.close();
      }
    });
  });
});
