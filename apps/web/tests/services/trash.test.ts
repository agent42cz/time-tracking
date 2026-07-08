/**
 * AIAGE-51 — trash scoping, owner restore, enriched rows.
 * Covers US-91, US-92, US-93.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
// Tasks 8 and 9 append `purgeEntry` and `purgeOldDeleted` to this import list.
import {
  listTrash,
  restoreEntry,
  softDeleteEntry,
  startTimer,
} from '../../src/lib/services/time-entries.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  other: string;
  outsider: string;
  company: string;
  otherCompany: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({ data: { email: `tr-a-${suffix}@x.test`, fullName: 'A' } });
  const user = await tx.user.create({ data: { email: `tr-u-${suffix}@x.test`, fullName: 'U' } });
  const other = await tx.user.create({ data: { email: `tr-o2-${suffix}@x.test`, fullName: 'O2' } });
  const outsider = await tx.user.create({
    data: { email: `tr-o-${suffix}@x.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Tr ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  await tx.membership.create({ data: { userId: other.id, companyId: company.id, role: 'user' } });
  const otherCompany = await createCompany(tx, {
    name: `Other ${suffix}`,
    createdByUserId: outsider.id,
  });
  return {
    admin: admin.id,
    user: user.id,
    other: other.id,
    outsider: outsider.id,
    company: company.id,
    otherCompany: otherCompany.id,
  };
}

describe('trash', () => {
  it('US-91: a non-admin owner restores their own soft-deleted entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const before = await tx.auditLog.count({ where: { companyId: w.company } });
      const result = await restoreEntry(tx, w.user, e.value.id);
      expect(result.ok).toBe(true);

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.value.id } });
      expect(reread.deletedAt).toBeNull();

      // Exactly one audit row for the mutation.
      const after = await tx.auditLog.count({ where: { companyId: w.company } });
      expect(after - before).toBe(1);
      const last = await tx.auditLog.findFirst({
        where: { entityId: e.value.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(last?.action).toBe('restore');
    });
  });

  it("US-91: a member cannot restore another member's entry", async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91b');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await restoreEntry(tx, w.other, e.value.id);
      expect(result).toEqual({ ok: false, reason: 'not_found' });

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.value.id } });
      expect(reread.deletedAt).not.toBeNull();
    });
  });

  it('US-91: a cross-company actor restoring returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91c');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await restoreEntry(tx, w.outsider, e.value.id);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it("US-92: a member sees only their own deleted entries; an admin sees everyone's", async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us92');
      const mine = await startTimer(tx, w.user, { companyId: w.company, description: 'mine' });
      const theirs = await startTimer(tx, w.other, { companyId: w.company, description: 'theirs' });
      if (!mine.ok || !theirs.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, mine.value.id);
      await softDeleteEntry(tx, w.other, theirs.value.id);

      const asMember = await listTrash(tx, w.user, w.company);
      expect(asMember.ok).toBe(true);
      if (asMember.ok) {
        expect(asMember.value.map((r) => r.id)).toEqual([mine.value.id]);
      }

      const asAdmin = await listTrash(tx, w.admin, w.company);
      expect(asAdmin.ok).toBe(true);
      if (asAdmin.ok) {
        expect(asAdmin.value.map((r) => r.id).sort()).toEqual(
          [mine.value.id, theirs.value.id].sort(),
        );
      }
    });
  });

  it('US-92: a non-member listing the trash returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us92b');
      const result = await listTrash(tx, w.outsider, w.company);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-93: trash rows expose start, end and duration inputs', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us93');
      const client = await tx.client.create({
        data: { companyId: w.company, name: 'Klient X', sortOrder: 1 },
      });
      const started = new Date(Date.now() - 2 * 3_600_000);
      const ended = new Date(Date.now() - 3_600_000);
      const e = await startTimer(tx, w.user, {
        companyId: w.company,
        description: '',
        clientId: client.id,
      });
      if (!e.ok) throw new Error('setup');
      await tx.timeEntry.update({
        where: { id: e.value.id },
        data: { startedAt: started, endedAt: ended },
      });
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await listTrash(tx, w.user, w.company);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = result.value[0];
      expect(row).toBeDefined();
      expect(row?.startedAt.getTime()).toBe(started.getTime());
      expect(row?.endedAt?.getTime()).toBe(ended.getTime());
      expect(row?.clientName).toBe('Klient X');
      expect(row?.userName).toBe('U');
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });
  });

  it('US-93: a soft-deleted running entry reports a null end', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us93b');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await listTrash(tx, w.user, w.company);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value[0]?.endedAt).toBeNull();
    });
  });
});
