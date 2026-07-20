/**
 * AIAGE-51 — trash scoping, owner restore, enriched rows.
 * Covers US-93, US-94, US-95.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { callsTo, recordingDb, soleCallArg } from '../_helpers/recording-db.js';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  PURGE_BATCH_SIZE,
  listTrash,
  purgeEntry,
  purgeOldDeleted,
  restoreEntry,
  softDeleteEntry,
  startTimer,
} from '../../src/lib/services/time-entries.js';

const RETENTION_MS = 30 * 24 * 3_600_000;

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
  it('US-93: a non-admin owner restores their own soft-deleted entry', async () => {
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

  it('US-93: the restore restates deletedAt on the UPDATE itself, not just on the read', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91d');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const { db, calls } = recordingDb(tx);
      expect(await restoreEntry(db, w.user, e.value.id)).toEqual({ ok: true, value: true });

      // The mirror image of the purge's predicate. An admin (or the cron's 30 s
      // transaction) can hard-delete the row between the `findUnique` and this
      // write; an unconditional `update({ where: { id } })` would throw P2025 into
      // `restoreEntryAction`, which has no catch, blanking /trash. `updateMany`
      // returns a count instead, and the restated `deletedAt` keeps the write
      // idempotent against a concurrent restore.
      expect(soleCallArg(calls, 'timeEntry', 'updateMany')).toMatchObject({
        where: { id: e.value.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      expect(callsTo(calls, 'timeEntry', 'update')).toHaveLength(0);

      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: e.value.id } });
      expect(reread.deletedAt).toBeNull();
      // Still exactly one audit row, and only because the UPDATE matched.
      expect(await tx.auditLog.count({ where: { entityId: e.value.id, action: 'restore' } })).toBe(
        1,
      );
    });
  });

  it("US-93: a member cannot restore another member's entry", async () => {
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

  it('US-93: a cross-company actor restoring returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us91c');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const result = await restoreEntry(tx, w.outsider, e.value.id);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it("US-94: a member sees only their own deleted entries; an admin sees everyone's", async () => {
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

  it('US-94: a non-member listing the trash returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us92b');
      const result = await listTrash(tx, w.outsider, w.company);
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-95: trash rows expose start, end and duration inputs', async () => {
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

  it('US-95: a soft-deleted running entry reports a null end', async () => {
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

  it('US-97: an admin purges an entry permanently, leaving exactly one purge audit row', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95');
      const tag = await tx.tag.create({
        data: { companyId: w.company, name: 'T', color: '#fff' },
      });
      const e = await startTimer(tx, w.user, {
        companyId: w.company,
        description: 'doomed',
        tagIds: [tag.id],
      });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const before = await tx.auditLog.count({ where: { companyId: w.company } });
      const result = await purgeEntry(tx, w.admin, e.value.id);
      expect(result.ok).toBe(true);

      // The row is gone, and so are its tag joins (onDelete: Cascade).
      expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).toBeNull();
      expect(await tx.timeEntryTag.count({ where: { timeEntryId: e.value.id } })).toBe(0);

      const after = await tx.auditLog.count({ where: { companyId: w.company } });
      expect(after - before).toBe(1);

      const row = await tx.auditLog.findFirstOrThrow({
        where: { entityId: e.value.id, action: 'purge' },
      });
      // The snapshot is the entry's only surviving trace, so it has to name the
      // entry's owner: `actorUserId` records the admin who pressed the button.
      expect(row.actorUserId).toBe(w.admin);
      expect(row.before).toMatchObject({ description: 'doomed', tagIds: [tag.id], userId: w.user });
      expect(row.after).toBeNull();
    });
  });

  it('US-97: the purge restates deletedAt on the DELETE itself, not just on the read', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95f');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      const { db, calls } = recordingDb(tx);
      expect(await purgeEntry(db, w.admin, e.value.id)).toEqual({ ok: true, value: true });

      // The owner can restore the entry from their own /trash between the
      // `findUnique` and this write. Under READ COMMITTED Postgres re-evaluates a
      // DELETE's predicate against the current row version, so restating
      // `deletedAt` here — and only here — is what keeps a live entry alive.
      // A `delete()` on `{ id }` alone would also throw P2025 at a caller with no
      // catch. The race itself cannot be staged inside `withTx` (one transaction,
      // a second writer deadlocks); the predicate can be, and it is the thing a
      // one-token edit removes.
      expect(soleCallArg(calls, 'timeEntry', 'deleteMany')).toMatchObject({
        where: { id: e.value.id, deletedAt: { not: null } },
      });
      expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).toBeNull();
    });
  });

  it('US-97: a member cannot purge their own entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95b');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      expect(await purgeEntry(tx, w.user, e.value.id)).toEqual({ ok: false, reason: 'not_found' });
      expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).not.toBeNull();
    });
  });

  it('US-97: purging a cross-company entry returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95c');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);

      expect(await purgeEntry(tx, w.outsider, e.value.id)).toEqual({
        ok: false,
        reason: 'not_found',
      });
    });
  });

  it('US-97: purging an entry that is not in the trash returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95d');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');

      expect(await purgeEntry(tx, w.admin, e.value.id)).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-97: purging an entry restored out of the trash before the read returns not_found', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us95e');
      const e = await startTimer(tx, w.user, { companyId: w.company });
      if (!e.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, e.value.id);
      await restoreEntry(tx, w.user, e.value.id);

      // The restore is already committed when `purgeEntry` reads the row, so the
      // `!entry.deletedAt` pre-check short-circuits and control never reaches
      // `writeAudit` or the DELETE. That is why no `purge` row exists here.
      //
      // This says nothing about the *race*, where the restore lands after the
      // pre-check: there the audit row is written and the DELETE finds no
      // matching row — the accepted direction of failure (ADR-0011). The
      // predicate that makes that safe is asserted directly on the write, in
      // 'US-97: the purge restates deletedAt on the DELETE itself'.
      expect(await purgeEntry(tx, w.admin, e.value.id)).toEqual({ ok: false, reason: 'not_found' });
      expect(await tx.timeEntry.findUnique({ where: { id: e.value.id } })).not.toBeNull();
      expect(await tx.auditLog.count({ where: { entityId: e.value.id, action: 'purge' } })).toBe(0);
    });
  });

  it('US-98: the daily purge audits every doomed entry in one write', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us96c');
      const a = await startTimer(tx, w.user, { companyId: w.company, description: 'a' });
      const b = await startTimer(tx, w.other, { companyId: w.company, description: 'b' });
      if (!a.ok || !b.ok) throw new Error('setup');

      const now = new Date('2026-05-03T00:00:00Z');
      const longAgo = new Date(now.getTime() - 31 * 24 * 3_600_000);
      await softDeleteEntry(tx, w.user, a.value.id, longAgo);
      await softDeleteEntry(tx, w.other, b.value.id, longAgo);

      const { db, calls } = recordingDb(tx);
      expect((await purgeOldDeleted(db, now)).purged).toBe(2);

      // "One write" is the point: N doomed entries, one INSERT. N sequential
      // round-trips would blow the cron transaction's 30 s timeout on the first
      // production run.
      expect(callsTo(calls, 'auditLog', 'createMany')).toHaveLength(1);
      expect(callsTo(calls, 'auditLog', 'create')).toHaveLength(0);

      // …and that one INSERT is what forces the SELECT to be bounded: ~8 bound
      // parameters per audit row against Postgres's 65 535-parameter ceiling.
      expect(soleCallArg(calls, 'timeEntry', 'findMany')).toMatchObject({
        take: PURGE_BATCH_SIZE,
        orderBy: { deletedAt: 'asc' },
      });

      const rows = await tx.auditLog.findMany({
        where: { entityId: { in: [a.value.id, b.value.id] }, action: 'purge' },
      });
      expect(rows).toHaveLength(2);
      // `createMany` must reproduce what `writeAudit` wrote: the schema default
      // for `source`, and SQL NULL for the omitted `after`.
      for (const row of rows) {
        expect(row.actorUserId).toBeNull();
        expect(row.source).toBe('web');
        expect(row.after).toBeNull();
      }
      // The snapshot names the entry's owner — `actorUserId` is null here, so
      // it is the only record of whose entry was destroyed.
      const rowA = rows.find((r) => r.entityId === a.value.id);
      expect(rowA?.before).toMatchObject({ description: 'a', userId: w.user });
      const rowB = rows.find((r) => r.entityId === b.value.id);
      expect(rowB?.before).toMatchObject({ description: 'b', userId: w.other });
    });
  });

  it('US-98: the daily purge hard-deletes >30-day-old entries and audits each one', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us96');
      const old = await startTimer(tx, w.user, { companyId: w.company, description: 'old' });
      const fresh = await startTimer(tx, w.user, { companyId: w.company, description: 'fresh' });
      if (!old.ok || !fresh.ok) throw new Error('setup');

      const now = new Date('2026-05-03T00:00:00Z');
      const longAgo = new Date(now.getTime() - 31 * 24 * 3_600_000);
      const recently = new Date(now.getTime() - 29 * 24 * 3_600_000);
      await softDeleteEntry(tx, w.user, old.value.id, longAgo);
      await softDeleteEntry(tx, w.user, fresh.value.id, recently);

      const before = await tx.auditLog.count({ where: { companyId: w.company } });
      const result = await purgeOldDeleted(tx, now);
      expect(result.purged).toBe(1);

      expect(await tx.timeEntry.findUnique({ where: { id: old.value.id } })).toBeNull();
      expect(await tx.timeEntry.findUnique({ where: { id: fresh.value.id } })).not.toBeNull();

      // Exactly one audit row per purged entry, actor-less (system-initiated).
      const after = await tx.auditLog.count({ where: { companyId: w.company } });
      expect(after - before).toBe(1);
      const row = await tx.auditLog.findFirstOrThrow({
        where: { entityId: old.value.id, action: 'purge' },
      });
      expect(row.actorUserId).toBeNull();
      expect(row.before).toMatchObject({ description: 'old' });
    });
  });

  it('US-98: the daily purge restates deletedAt < cutoff on the DELETE, not just the SELECT', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us96d');
      const old = await startTimer(tx, w.user, { companyId: w.company, description: 'old' });
      if (!old.ok) throw new Error('setup');

      const now = new Date('2026-05-03T00:00:00Z');
      const cutoff = new Date(now.getTime() - RETENTION_MS);
      await softDeleteEntry(
        tx,
        w.user,
        old.value.id,
        new Date(now.getTime() - 31 * 24 * 3_600_000),
      );

      const { db, calls } = recordingDb(tx);
      expect((await purgeOldDeleted(db, now)).purged).toBe(1);

      // `id: { in: doomed }` is NOT enough. The job audits every doomed entry and
      // only then deletes; a user who restores one of them in that window would be
      // inside the id list and get hard-deleted, irreversibly. Restating
      // `deletedAt < cutoff` on the DELETE makes Postgres re-check the *current*
      // row version under READ COMMITTED and skip it. A transaction does not give
      // us this — it would re-evaluate the DELETE, never the earlier SELECT.
      //
      // No black-box assertion can see this: every entry a test can set up as
      // "restored" is absent from `doomed`, so the id clause alone excludes it and
      // the suite stays green with the predicate deleted. Hence the assertion on
      // the write itself.
      expect(soleCallArg(calls, 'timeEntry', 'deleteMany')).toMatchObject({
        where: { id: { in: [old.value.id] }, deletedAt: { lt: cutoff } },
      });
      expect(await tx.timeEntry.findUnique({ where: { id: old.value.id } })).toBeNull();
    });
  });

  it('US-98: a purge run with nothing to purge writes no audit rows', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us96b');
      const before = await tx.auditLog.count({ where: { companyId: w.company } });
      expect((await purgeOldDeleted(tx, new Date())).purged).toBe(0);
      expect(await tx.auditLog.count({ where: { companyId: w.company } })).toBe(before);
    });
  });
});
