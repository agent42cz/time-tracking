import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { createClient, createProject, createTag } from '../../../../src/lib/services/catalog.js';
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
  it('returns clients/projects/tags filtered by query', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'lc');
      const c = await createClient(tx, w.userId, { companyId: w.companyId, name: 'Acme' });
      if (!c.ok) throw new Error('setup');
      await createProject(tx, w.userId, { clientId: c.value.id, name: 'Web' });
      await createTag(tx, w.userId, { companyId: w.companyId, name: 'work' });

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

        const t1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'tags', query: 'wo' },
        });
        expect(
          (t1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('work');
      } finally {
        await m.close();
      }
    });
  });
});
