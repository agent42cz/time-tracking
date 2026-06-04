/**
 * Phase 4 — Catalog (clients/projects/tags) tests.
 * Covers US-13, US-14, US-15, US-16, US-17, US-18.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  archiveClient,
  archiveProject,
  createClient,
  createProject,
  createTag,
  deleteClient,
  deleteProject,
  deleteTag,
  listClients,
  listProjects,
  listTags,
  reorderClients,
  reorderProjects,
  updateTag,
} from '../../src/lib/services/catalog.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  outsider: string;
  company: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({
    data: { email: `cat-admin-${suffix}@example.test`, fullName: 'A' },
  });
  const user = await tx.user.create({
    data: { email: `cat-user-${suffix}@example.test`, fullName: 'U' },
  });
  const outsider = await tx.user.create({
    data: { email: `cat-out-${suffix}@example.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Cat ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  // outsider has no membership in this company
  await createCompany(tx, { name: `Other ${suffix}`, createdByUserId: outsider.id });
  return { admin: admin.id, user: user.id, outsider: outsider.id, company: company.id };
}

async function auditCount(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  return tx.auditLog.count({ where: { companyId } });
}

describe('catalog (clients / projects / tags)', () => {
  it('US-13: admin creates clients and groups projects under them', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us13');
      const client = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      expect(client.ok).toBe(true);
      if (!client.ok) return;
      const project = await createProject(tx, w.admin, {
        clientId: client.value.id,
        name: 'Website',
      });
      expect(project.ok).toBe(true);

      // user (non-admin) cannot create
      const denied = await createClient(tx, w.user, { companyId: w.company, name: 'Stealthy' });
      expect(denied.ok).toBe(false);
    });
  });

  it('US-14: creating a project writes exactly one audit row', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'proj-audit');
      const client = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      const before = await auditCount(tx, w.company);
      const project = await createProject(tx, w.admin, {
        clientId: client.value.id,
        name: 'Website',
      });
      expect(project.ok).toBe(true);
      expect((await auditCount(tx, w.company)) - before).toBe(1);
      const rows = await tx.auditLog.findMany({
        where: { companyId: w.company, entityType: 'Project' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('create');
    });
  });

  it('US-14: archive removes the client from the default picker but keeps history', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us14');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Old Co' });
      if (!c.ok) throw new Error('setup');
      await archiveClient(tx, w.admin, c.value.id, true);

      const visible = await listClients(tx, w.admin, w.company);
      expect(visible.ok).toBe(true);
      if (visible.ok) expect(visible.value.find((cl) => cl.id === c.value.id)).toBeUndefined();

      const all = await listClients(tx, w.admin, w.company, { includeArchived: true });
      expect(all.ok).toBe(true);
      if (all.ok) expect(all.value.find((cl) => cl.id === c.value.id)?.archived).toBe(true);
    });
  });

  it('US-14: archiving a project hides it from the default picker', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us14p');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup');
      const p = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Old' });
      if (!p.ok) throw new Error('setup');
      const arch = await archiveProject(tx, w.admin, p.value.id, true);
      expect(arch.ok).toBe(true);
      const reread = await tx.project.findUniqueOrThrow({ where: { id: p.value.id } });
      expect(reread.archived).toBe(true);
    });
  });

  it('US-15: deleting a client with cascade=false orphans linked entries (NOT cascade)', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us15a');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Will Orphan' });
      if (!c.ok) throw new Error('setup');
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          clientId: c.value.id,
          startedAt: new Date('2026-04-01T08:00:00Z'),
          endedAt: new Date('2026-04-01T09:00:00Z'),
        },
      });
      const result = await deleteClient(tx, w.admin, c.value.id, { cascade: false });
      expect(result.ok).toBe(true);
      const remaining = await tx.timeEntry.findMany({ where: { companyId: w.company } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.clientId).toBeNull();
      expect(remaining[0]!.deletedAt).toBeNull();
    });
  });

  it('US-15: deleting a client with cascade=true soft-deletes linked entries', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us15b');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Cascade' });
      if (!c.ok) throw new Error('setup');
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          clientId: c.value.id,
          startedAt: new Date('2026-04-01T08:00:00Z'),
          endedAt: new Date('2026-04-01T09:00:00Z'),
        },
      });
      const result = await deleteClient(tx, w.admin, c.value.id, { cascade: true });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.entriesAffected).toBe(1);
      const remaining = await tx.timeEntry.findMany({ where: { companyId: w.company } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.deletedAt).not.toBeNull();
    });
  });

  it('US-15: deleting a project applies the same cascade rule', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us15p');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'X' });
      if (!c.ok) throw new Error('setup');
      const p = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Y' });
      if (!p.ok) throw new Error('setup');
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          clientId: c.value.id,
          projectId: p.value.id,
          startedAt: new Date('2026-04-01T08:00:00Z'),
          endedAt: new Date('2026-04-01T09:00:00Z'),
        },
      });
      const result = await deleteProject(tx, w.admin, p.value.id, { cascade: false });
      expect(result.ok).toBe(true);
      const remaining = await tx.timeEntry.findMany({ where: { companyId: w.company } });
      expect(remaining[0]!.projectId).toBeNull();
      expect(remaining[0]!.clientId).toBe(c.value.id);
      expect(remaining[0]!.deletedAt).toBeNull();
    });
  });

  it('US-16: only admins can rename / recolor / delete tags', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us16');
      const t = await createTag(tx, w.admin, {
        companyId: w.company,
        name: 'design',
        color: '#3b82f6',
      });
      if (!t.ok) throw new Error('setup');

      const userTry = await updateTag(tx, w.user, t.value.id, { name: 'design2' });
      expect(userTry.ok).toBe(false);
      const userDel = await deleteTag(tx, w.user, t.value.id);
      expect(userDel.ok).toBe(false);

      const adminEdit = await updateTag(tx, w.admin, t.value.id, { color: '#10b981' });
      expect(adminEdit.ok).toBe(true);
      const reread = await tx.tag.findUniqueOrThrow({ where: { id: t.value.id } });
      expect(reread.color).toBe('#10b981');
    });
  });

  it('US-17: a regular user can create a tag inline', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us17');
      const t = await createTag(tx, w.user, { companyId: w.company, name: 'urgent' });
      expect(t.ok).toBe(true);
      // outsider cannot
      const cross = await createTag(tx, w.outsider, { companyId: w.company, name: 'sneaky' });
      expect(cross.ok).toBe(false);
    });
  });

  it('US-18: a regular user can read clients/projects/tags but not write them', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us18');
      await createClient(tx, w.admin, { companyId: w.company, name: 'Visible' });
      const list = await listClients(tx, w.user, w.company);
      expect(list.ok).toBe(true);
      const tagList = await listTags(tx, w.user, w.company);
      expect(tagList.ok).toBe(true);

      const denied = await createClient(tx, w.user, { companyId: w.company, name: 'No' });
      expect(denied.ok).toBe(false);

      // outsider 404
      const cross = await listClients(tx, w.outsider, w.company);
      expect(cross.ok).toBe(false);
    });
  });

  it('US-52: reorderClients writes 1..N sortOrder for the active set and one audit row', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52a');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'B' });
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'C' });
      if (!a.ok || !b.ok || !c.ok) throw new Error('setup');

      const before = await auditCount(tx, w.company);
      const r = await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [c.value.id, a.value.id, b.value.id],
      });
      expect(r.ok).toBe(true);

      const rows = await tx.client.findMany({
        where: { companyId: w.company },
        orderBy: { sortOrder: 'asc' },
      });
      expect(rows.map((r) => r.id)).toEqual([c.value.id, a.value.id, b.value.id]);
      expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]);

      expect(await auditCount(tx, w.company)).toBe(before + 1);
      const audit = await tx.auditLog.findFirst({
        where: { companyId: w.company, action: 'reorder' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.entityType).toBe('client_order');
      expect(audit?.entityId).toBe(w.company);
    });
  });

  it('US-52: reorderClients ignores archived clients', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52b');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'B' });
      const z = await createClient(tx, w.admin, { companyId: w.company, name: 'Z' });
      if (!a.ok || !b.ok || !z.ok) throw new Error('setup');
      await archiveClient(tx, w.admin, z.value.id, true);
      const archivedBefore = await tx.client.findUniqueOrThrow({ where: { id: z.value.id } });

      const r = await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [b.value.id, a.value.id],
      });
      expect(r.ok).toBe(true);

      const archivedAfter = await tx.client.findUniqueOrThrow({ where: { id: z.value.id } });
      expect(archivedAfter.sortOrder).toBe(archivedBefore.sortOrder);
    });
  });

  it('US-52: reorderClients returns not_found when orderedIds contain a foreign-company client id', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52c');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      if (!a.ok) throw new Error('setup');

      const otherCompany = await createCompany(tx, {
        name: 'Other co',
        createdByUserId: w.outsider,
      });
      const foreign = await createClient(tx, w.outsider, {
        companyId: otherCompany.id,
        name: 'Foreign',
      });
      if (!foreign.ok) throw new Error('setup');

      const r = await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [foreign.value.id, a.value.id],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not_found');
    });
  });

  it('US-52: reorderClients returns not_found when orderedIds is missing an active client', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52d');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'B' });
      if (!a.ok || !b.ok) throw new Error('setup');

      const r = await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [a.value.id], // missing b
      });
      expect(r.ok).toBe(false);
    });
  });

  it('US-52: reorderClients denies non-admin members', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52e');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'B' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const r = await reorderClients(tx, w.user, {
        companyId: w.company,
        orderedIds: [b.value.id, a.value.id],
      });
      expect(r.ok).toBe(false);
    });
  });

  it('US-53: reorderProjects writes 1..N sortOrder within the client and one audit row', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us53a');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'C' });
      if (!c.ok) throw new Error('setup');
      const p1 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Alpha' });
      const p2 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Beta' });
      const p3 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Gamma' });
      if (!p1.ok || !p2.ok || !p3.ok) throw new Error('setup');

      const before = await auditCount(tx, w.company);
      const r = await reorderProjects(tx, w.admin, {
        companyId: w.company,
        clientId: c.value.id,
        orderedIds: [p3.value.id, p1.value.id, p2.value.id],
      });
      expect(r.ok).toBe(true);

      const rows = await tx.project.findMany({
        where: { clientId: c.value.id },
        orderBy: { sortOrder: 'asc' },
      });
      expect(rows.map((r) => r.id)).toEqual([p3.value.id, p1.value.id, p2.value.id]);
      expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]);

      expect(await auditCount(tx, w.company)).toBe(before + 1);
      const audit = await tx.auditLog.findFirst({
        where: { companyId: w.company, action: 'reorder', entityType: 'project_order' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.entityId).toBe(c.value.id);
    });
  });

  it('US-53: reorderProjects returns not_found when clientId belongs to another company', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us53b');
      const otherCompany = await createCompany(tx, {
        name: 'Other ts',
        createdByUserId: w.outsider,
      });
      const foreignClient = await createClient(tx, w.outsider, {
        companyId: otherCompany.id,
        name: 'Foreign',
      });
      if (!foreignClient.ok) throw new Error('setup');
      const r = await reorderProjects(tx, w.admin, {
        companyId: w.company,
        clientId: foreignClient.value.id,
        orderedIds: [],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not_found');
    });
  });

  it('US-53: reorderProjects returns not_found when orderedIds includes a project from a different client', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us53c');
      const c1 = await createClient(tx, w.admin, { companyId: w.company, name: 'C1' });
      const c2 = await createClient(tx, w.admin, { companyId: w.company, name: 'C2' });
      if (!c1.ok || !c2.ok) throw new Error('setup');
      const p1 = await createProject(tx, w.admin, { clientId: c1.value.id, name: 'P1' });
      const p2 = await createProject(tx, w.admin, { clientId: c2.value.id, name: 'P2' });
      if (!p1.ok || !p2.ok) throw new Error('setup');

      const r = await reorderProjects(tx, w.admin, {
        companyId: w.company,
        clientId: c1.value.id,
        orderedIds: [p1.value.id, p2.value.id],
      });
      expect(r.ok).toBe(false);
    });
  });

  it('US-52: reorderClients returns not_found when orderedIds contains duplicates', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us52dup');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'A' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'B' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const r = await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [a.value.id, a.value.id], // duplicate, missing b
      });
      expect(r.ok).toBe(false);
    });
  });

  it('US-53: reorderProjects returns not_found when orderedIds contains duplicates', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us53dup');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'C' });
      if (!c.ok) throw new Error('setup');
      const p1 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'P1' });
      const p2 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'P2' });
      if (!p1.ok || !p2.ok) throw new Error('setup');
      const r = await reorderProjects(tx, w.admin, {
        companyId: w.company,
        clientId: c.value.id,
        orderedIds: [p1.value.id, p1.value.id],
      });
      expect(r.ok).toBe(false);
    });
  });

  it('listProjects returns projects for company across clients', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'lp1');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Client LP' });
      if (!c.ok) throw new Error('setup');
      const p1 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Project Alpha' });
      const p2 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Project Beta' });
      if (!p1.ok || !p2.ok) throw new Error('setup');

      const res = await listProjects(tx, w.user, w.company, {});
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.length).toBeGreaterThanOrEqual(2);
      expect(res.value.every((p) => typeof p.clientId === 'string')).toBe(true);
    });
  });

  it('listProjects is not_found for a non-member', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'lp2');
      const res = await listProjects(tx, w.outsider, w.company, {});
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not_found');
    });
  });

  it('US-52/53: client.findMany ordered by (archived asc, sortOrder asc, name asc) returns expected sequence', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'order');
      const a = await createClient(tx, w.admin, { companyId: w.company, name: 'Apple' });
      const b = await createClient(tx, w.admin, { companyId: w.company, name: 'Banana' });
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Cherry' });
      const d = await createClient(tx, w.admin, { companyId: w.company, name: 'Damson' });
      if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('setup');

      // canonical order: Cherry, Apple, Banana (active), Damson archived at the bottom
      await reorderClients(tx, w.admin, {
        companyId: w.company,
        orderedIds: [c.value.id, a.value.id, b.value.id, d.value.id],
      });
      await archiveClient(tx, w.admin, d.value.id, true);

      const rows = await tx.client.findMany({
        where: { companyId: w.company },
        orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(rows.map((r) => r.name)).toEqual(['Cherry', 'Apple', 'Banana', 'Damson']);
    });
  });
});
