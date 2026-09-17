import { afterAll, beforeAll, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../src/lib/services/companies.js';
import { startTimer } from '../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../_helpers/mcp.js';

beforeAll(() => getTestPrisma(), 180_000);
afterAll(() => stopTestPrisma());

it('US-7: one MCP connection discovers and uses a second company without mixing timers', async () => {
  await withTx(async (db) => {
    const user = await db.user.create({ data: { email: 'multi@test.cz', fullName: 'Multi' } });
    const a = await createCompany(db, { name: 'First', createdByUserId: user.id });
    const b = await createCompany(db, { name: 'Second', createdByUserId: user.id });
    const aTimer = await startTimer(db, user.id, { companyId: a.id, description: 'First work' });
    if (!aTimer.ok) throw new Error('setup');
    const mcp = await buildInProcessMcp({
      db,
      userId: user.id,
      companyId: a.id,
      allCompanies: true,
    });
    const auditCount = () => db.auditLog.count();
    try {
      const companies = await mcp.client.callTool({ name: 'list_companies', arguments: {} });
      expect(companies.structuredContent).toMatchObject({
        companies: expect.arrayContaining([
          expect.objectContaining({ id: a.id }),
          expect.objectContaining({ id: b.id }),
        ]),
      });
      const before = await auditCount();
      const started = await mcp.client.callTool({
        name: 'start_timer',
        arguments: { companyId: b.id, title: 'Second work' },
      });
      expect(started.isError).not.toBe(true);
      const id = (started.structuredContent as { id: string }).id;
      expect(await db.timeEntry.findUnique({ where: { id } })).toMatchObject({ companyId: b.id });
      expect(await auditCount()).toBe(before + 1);
      for (const name of ['list_running_entries', 'list_recent_entries']) {
        const result = await mcp.client.callTool({ name, arguments: { companyId: b.id } });
        expect(result.structuredContent).toMatchObject({
          entries: [expect.objectContaining({ id })],
        });
      }
      const edited = await mcp.client.callTool({
        name: 'update_entry',
        arguments: { entryId: id, title: 'Edited' },
      });
      expect(edited.isError).not.toBe(true);
      expect(await auditCount()).toBe(before + 2);
      const stopped = await mcp.client.callTool({ name: 'stop_timer', arguments: { entryId: id } });
      expect(stopped.isError).not.toBe(true);
      expect(await auditCount()).toBe(before + 3);
      expect(await db.timeEntry.findUnique({ where: { id: aTimer.value.id } })).toMatchObject({
        endedAt: null,
      });
    } finally {
      await mcp.close();
    }
  });
});

it('US-61: a company-scoped token cannot mutate another company even when its owner belongs to both', async () => {
  await withTx(async (db) => {
    const user = await db.user.create({ data: { email: 'scoped@test.cz', fullName: 'Scoped' } });
    const a = await createCompany(db, { name: 'A', createdByUserId: user.id });
    const b = await createCompany(db, { name: 'B', createdByUserId: user.id });
    const timer = await startTimer(db, user.id, { companyId: b.id });
    if (!timer.ok) throw new Error('setup');
    const mcp = await buildInProcessMcp({ db, userId: user.id, companyId: a.id });
    const auditCount = () => db.auditLog.count();
    const before = await auditCount();
    try {
      for (const [name, args] of [
        ['stop_timer', { entryId: timer.value.id }],
        ['update_entry', { entryId: timer.value.id, title: 'No' }],
        ['start_timer', { companyId: b.id }],
        ['list_running_entries', { companyId: b.id }],
        ['list_recent_entries', { companyId: b.id }],
        ['list_catalog', { companyId: b.id, kind: 'clients' }],
      ] as const) {
        const out = await mcp.client.callTool({ name, arguments: args });
        expect(out.isError, name).toBe(true);
        expect(out.structuredContent, name).toMatchObject({ code: 'not_found' });
      }
      expect(await auditCount()).toBe(before);
    } finally {
      await mcp.close();
    }
  });
});

it('US-61: all-company MCP access never includes outsiders and stops at membership removal', async () => {
  await withTx(async (db) => {
    const user = await db.user.create({ data: { email: 'removed@test.cz', fullName: 'Multi' } });
    const other = await db.user.create({ data: { email: 'outsider@test.cz', fullName: 'Other' } });
    const a = await createCompany(db, { name: 'Default', createdByUserId: user.id });
    const b = await createCompany(db, { name: 'Second', createdByUserId: user.id });
    const c = await createCompany(db, { name: 'Private', createdByUserId: other.id });
    const bClient = await db.client.create({ data: { companyId: b.id, name: 'Client B' } });
    const bProject = await db.project.create({ data: { clientId: bClient.id, name: 'Project B' } });
    const bTimer = await startTimer(db, user.id, { companyId: b.id });
    const cTimer = await startTimer(db, other.id, { companyId: c.id });
    if (!bTimer.ok || !cTimer.ok) throw new Error('setup');
    const mcp = await buildInProcessMcp({
      db,
      userId: user.id,
      companyId: a.id,
      allCompanies: true,
    });
    const auditCount = () => db.auditLog.count();
    try {
      const before = await auditCount();
      for (const [kind, id] of [
        ['clients', bClient.id],
        ['projects', bProject.id],
      ]) {
        expect(
          (
            await mcp.client.callTool({
              name: 'list_catalog',
              arguments: { kind, companyId: b.id },
            })
          ).structuredContent,
        ).toMatchObject({ items: [expect.objectContaining({ id })] });
      }
      const wrongProject = await mcp.client.callTool({
        name: 'start_timer',
        arguments: { companyId: a.id, projectId: bProject.id, clientId: bClient.id },
      });
      expect(wrongProject.structuredContent).toMatchObject({ code: 'not_found' });
      await db.membership.delete({
        where: { userId_companyId: { userId: user.id, companyId: b.id } },
      });
      const available = await mcp.client.callTool({ name: 'list_companies', arguments: {} });
      expect(available.structuredContent).toMatchObject({
        companies: [expect.objectContaining({ id: a.id })],
      });
      for (const [companyId, entryId] of [
        [b.id, bTimer.value.id],
        [c.id, cTimer.value.id],
      ]) {
        for (const [name, args] of [
          ['start_timer', { companyId }],
          ['list_running_entries', { companyId }],
          ['list_recent_entries', { companyId }],
          ['list_catalog', { companyId, kind: 'clients' }],
          ['stop_timer', { entryId }],
          ['update_entry', { entryId, title: 'No' }],
        ] as const) {
          const result = await mcp.client.callTool({ name, arguments: args });
          expect(result.isError, name).toBe(true);
          expect(result.structuredContent, name).toMatchObject({ code: 'not_found' });
        }
      }
      expect(await auditCount()).toBe(before);
    } finally {
      await mcp.close();
    }
  });
});
