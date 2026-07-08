/**
 * Phase 5 — Time entries tests.
 * Covers US-19, US-20, US-21, US-22, US-23, US-24, US-25, US-26, US-27, US-28, US-54.
 *
 * Audit assertion: every mutation produces exactly one audit row in the
 * AuditLog table.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient, createTag } from '../../src/lib/services/catalog.js';
import {
  createManualEntry,
  getEntryHistory,
  listRecentEntries,
  listRecentHistory,
  listRunningEntries,
  listTrash,
  purgeOldDeleted,
  restoreEntry,
  softDeleteEntry,
  startTimer,
  stopTimer,
  updateEntry,
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
  outsider: string;
  company: string;
  tagId: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({ data: { email: `te-a-${suffix}@x.test`, fullName: 'A' } });
  const user = await tx.user.create({ data: { email: `te-u-${suffix}@x.test`, fullName: 'U' } });
  const outsider = await tx.user.create({
    data: { email: `te-o-${suffix}@x.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `TE ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
  await createCompany(tx, { name: `Other ${suffix}`, createdByUserId: outsider.id });
  const tag = await createTag(tx, admin.id, { companyId: company.id, name: 'work' });
  if (!tag.ok) throw new Error('setup');
  return {
    admin: admin.id,
    user: user.id,
    outsider: outsider.id,
    company: company.id,
    tagId: tag.value.id,
  };
}

async function auditCount(tx: Prisma.TransactionClient, entryId: string): Promise<number> {
  return tx.auditLog.count({ where: { entityType: 'TimeEntry', entityId: entryId } });
}

describe('time entries', () => {
  it('US-19: starts a timer with one click + description', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us19');
      const r = await startTimer(tx, w.user, {
        companyId: w.company,
        description: 'Writing tests',
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id: r.value.id } });
      expect(entry.endedAt).toBeNull();
      expect(entry.description).toBe('Writing tests');
      expect(await auditCount(tx, r.value.id)).toBe(1);
    });
  });

  it('US-20: attaches client/project/tags after the timer is running', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us20');
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup');
      const start = await startTimer(tx, w.user, { companyId: w.company, description: 'work' });
      if (!start.ok) throw new Error('setup');

      const upd = await updateEntry(tx, w.user, start.value.id, {
        clientId: c.value.id,
        tagIds: [w.tagId],
      });
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({
        where: { id: start.value.id },
        include: { tags: true },
      });
      expect(reread.clientId).toBe(c.value.id);
      expect(reread.tags).toHaveLength(1);
      // start + update = 2 audit rows
      expect(await auditCount(tx, start.value.id)).toBe(2);
    });
  });

  it('US-21: starts a second timer while one is already running', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us21');
      const a = await startTimer(tx, w.user, { companyId: w.company, description: 'first' });
      const b = await startTimer(tx, w.user, { companyId: w.company, description: 'second' });
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        const running = await tx.timeEntry.findMany({
          where: { userId: w.user, endedAt: null, deletedAt: null },
        });
        expect(running.map((r) => r.id).sort()).toEqual([a.value.id, b.value.id].sort());
      }
    });
  });

  it('US-22: stopping a timer makes it appear in todays list', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us22');
      const t0 = new Date('2026-05-03T10:00:00Z');
      const a = await startTimer(tx, w.user, { companyId: w.company }, t0);
      if (!a.ok) throw new Error('setup');
      const t1 = new Date(t0.getTime() + 5 * 60_000);
      const stop = await stopTimer(tx, w.user, a.value.id, t1);
      expect(stop.ok).toBe(true);
      const list = await listRecentEntries(tx, w.user, w.company, 50);
      expect(list.ok).toBe(true);
      if (list.ok) {
        expect(list.value.find((e) => e.id === a.value.id)).toBeTruthy();
      }
      expect(await auditCount(tx, a.value.id)).toBe(2); // create + stop=update
    });
  });

  it('US-23: manual entry — past dates allowed, future rejected, end > start required', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us23');
      const now = new Date('2026-05-03T10:00:00Z');
      const past = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-04-15T08:00:00Z'),
          endedAt: new Date('2026-04-15T09:00:00Z'),
          description: 'Backfill',
        },
        now,
      );
      expect(past.ok).toBe(true);

      const future = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-03T11:00:00Z'),
          endedAt: new Date('2026-05-03T12:00:00Z'),
        },
        now,
      );
      expect(future.ok).toBe(false);
      if (!future.ok) expect(future.reason).toBe('future_timestamp');

      const reversed = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-01T10:00:00Z'),
          endedAt: new Date('2026-05-01T09:00:00Z'),
        },
        now,
      );
      expect(reversed.ok).toBe(false);
      if (!reversed.ok) expect(reversed.reason).toBe('invalid_window');
    });
  });

  it('US-24: a user can edit any field of their own past entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us24');
      const now = new Date('2026-05-03T10:00:00Z');
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-04-15T08:00:00Z'),
          endedAt: new Date('2026-04-15T09:00:00Z'),
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const upd = await updateEntry(tx, w.user, m.value.id, {
        description: 'Edited',
        tagIds: [w.tagId],
      });
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({
        where: { id: m.value.id },
        include: { tags: true },
      });
      expect(reread.description).toBe('Edited');
      expect(reread.tags).toHaveLength(1);
    });
  });

  it('US-24: persists a separate note on create and update; audit captures the new note', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us24note');
      const now = new Date('2026-05-03T10:00:00Z');
      // createManualEntry with a note persists it.
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-04-15T08:00:00Z'),
          endedAt: new Date('2026-04-15T09:00:00Z'),
          note: 'initial note',
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const created = await tx.timeEntry.findUniqueOrThrow({ where: { id: m.value.id } });
      expect(created.note).toBe('initial note');

      // updateEntry with a note persists it and the audit `after` snapshot captures it.
      const upd = await updateEntry(tx, w.user, m.value.id, { note: 'detail text' });
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: m.value.id } });
      expect(reread.note).toBe('detail text');
      // description is untouched (note is a parallel field).
      expect(reread.description).toBe(created.description);

      const updateAudit = await tx.auditLog.findFirst({
        where: { entityType: 'TimeEntry', entityId: m.value.id, action: 'update' },
        orderBy: { createdAt: 'desc' },
      });
      expect((updateAudit?.after as { note?: string } | null)?.note).toBe('detail text');
      // create + update = exactly 2 audit rows (one update row added by the note edit).
      expect(await auditCount(tx, m.value.id)).toBe(2);
    });
  });

  it('US-25: soft-deleting hides the entry from normal queries (US-47 too)', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us25');
      const a = await startTimer(tx, w.user, { companyId: w.company });
      if (!a.ok) throw new Error('setup');
      const del = await softDeleteEntry(tx, w.user, a.value.id);
      expect(del.ok).toBe(true);
      const list = await listRecentEntries(tx, w.user, w.company, 50);
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.value.find((e) => e.id === a.value.id)).toBeUndefined();
    });
  });

  it('US-27: shows the change history of a single entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us27');
      const a = await startTimer(tx, w.user, {
        companyId: w.company,
        description: 'orig',
      });
      if (!a.ok) throw new Error('setup');
      await updateEntry(tx, w.user, a.value.id, { description: 'edit1' });
      await updateEntry(tx, w.user, a.value.id, { description: 'edit2' });
      const hist = await getEntryHistory(tx, w.user, a.value.id);
      expect(hist.ok).toBe(true);
      if (hist.ok) {
        expect(hist.value).toHaveLength(3); // create + 2 updates
        expect(hist.value[0]!.action).toBe('create');
        expect(hist.value[2]!.action).toBe('update');
      }

      // outsider gets 404
      const cross = await getEntryHistory(tx, w.outsider, a.value.id);
      expect(cross.ok).toBe(false);
    });
  });

  it('US-28: admin can edit and soft-delete any users entry; user cannot edit anothers', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us28');
      const a = await startTimer(tx, w.user, {
        companyId: w.company,
        description: 'mine',
      });
      if (!a.ok) throw new Error('setup');

      // admin can edit
      const adminEdit = await updateEntry(tx, w.admin, a.value.id, { description: 'admin-edit' });
      expect(adminEdit.ok).toBe(true);

      // outsider cannot
      const outEdit = await updateEntry(tx, w.outsider, a.value.id, { description: 'evil' });
      expect(outEdit.ok).toBe(false);

      // admin soft-deletes
      const adminDel = await softDeleteEntry(tx, w.admin, a.value.id);
      expect(adminDel.ok).toBe(true);

      // admin restores
      const restore = await restoreEntry(tx, w.admin, a.value.id);
      expect(restore.ok).toBe(true);
    });
  });

  it('US-54: owner shifts start time on a running timer; entry stays running', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54a');
      const start = await startTimer(tx, w.user, { companyId: w.company });
      if (!start.ok) throw new Error('setup');
      const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
      const newStart = new Date(entry.startedAt.getTime() - 60 * 60 * 1000);
      const upd = await updateEntry(tx, w.user, start.value.id, { startedAt: newStart });
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
      expect(reread.endedAt).toBeNull();
      expect(reread.startedAt.getTime()).toBe(newStart.getTime());
      expect(await auditCount(tx, start.value.id)).toBe(2); // start + edit
    });
  });

  it('US-54: owner sets endedAt on a running timer; entry becomes stopped', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54b');
      const timerStart = new Date('2026-05-03T09:00:00Z');
      const start = await startTimer(tx, w.user, { companyId: w.company }, timerStart);
      if (!start.ok) throw new Error('setup');
      const endedAt = new Date('2026-05-03T09:20:00Z');
      const now = new Date('2026-05-03T10:00:00Z');
      const upd = await updateEntry(tx, w.user, start.value.id, { endedAt }, now);
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: start.value.id } });
      expect(reread.endedAt?.getTime()).toBe(endedAt.getTime());
      expect(await auditCount(tx, start.value.id)).toBe(2);
    });
  });

  it('US-54: admin corrects another members stopped entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54c');
      const now = new Date('2026-05-03T10:00:00Z');
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-04-15T08:00:00Z'),
          endedAt: new Date('2026-04-15T09:00:00Z'),
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const newEnd = new Date('2026-04-15T08:20:00Z');
      const upd = await updateEntry(tx, w.admin, m.value.id, { endedAt: newEnd });
      expect(upd.ok).toBe(true);
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: m.value.id } });
      expect(reread.endedAt?.getTime()).toBe(newEnd.getTime());
      const audits = await tx.auditLog.findMany({
        where: { entityType: 'TimeEntry', entityId: m.value.id, action: 'update' },
      });
      expect(audits[0]?.actorUserId).toBe(w.admin);
    });
  });

  it('US-54: cross-company actor gets not_found when editing entry', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54d');
      const start = await startTimer(tx, w.user, { companyId: w.company });
      if (!start.ok) throw new Error('setup');
      const upd = await updateEntry(tx, w.outsider, start.value.id, {
        startedAt: new Date(Date.now() - 60_000),
      });
      expect(upd.ok).toBe(false);
      if (!upd.ok) expect(upd.reason).toBe('not_found');
    });
  });

  it('US-54: rejects future end timestamp', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54e');
      const now = new Date('2026-05-03T10:00:00Z');
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-03T08:00:00Z'),
          endedAt: new Date('2026-05-03T09:00:00Z'),
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const upd = await updateEntry(
        tx,
        w.user,
        m.value.id,
        { endedAt: new Date('2026-05-03T11:00:00Z') },
        now,
      );
      expect(upd.ok).toBe(false);
      if (!upd.ok) expect(upd.reason).toBe('future_timestamp');
    });
  });

  it('US-54: rejects end <= start', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54f');
      const now = new Date('2026-05-03T10:00:00Z');
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-03T08:00:00Z'),
          endedAt: new Date('2026-05-03T09:00:00Z'),
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const upd = await updateEntry(
        tx,
        w.user,
        m.value.id,
        { endedAt: new Date('2026-05-03T07:30:00Z') },
        now,
      );
      expect(upd.ok).toBe(false);
      if (!upd.ok) expect(upd.reason).toBe('invalid_window');
    });
  });

  it('US-54: rejects shifting start past existing end', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us54g');
      const now = new Date('2026-05-03T10:00:00Z');
      const m = await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-03T08:00:00Z'),
          endedAt: new Date('2026-05-03T09:00:00Z'),
        },
        now,
      );
      if (!m.ok) throw new Error('setup');
      const upd = await updateEntry(
        tx,
        w.user,
        m.value.id,
        { startedAt: new Date('2026-05-03T09:30:00Z') },
        now,
      );
      expect(upd.ok).toBe(false);
      if (!upd.ok) expect(upd.reason).toBe('invalid_window');
    });
  });

  it('US-96: purge cron deletes only entries soft-deleted >30 days ago', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'purge');
      const old = await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          startedAt: new Date('2026-01-01T08:00:00Z'),
          endedAt: new Date('2026-01-01T09:00:00Z'),
          deletedAt: new Date('2026-02-01T00:00:00Z'),
        },
      });
      const recent = await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          startedAt: new Date('2026-04-15T08:00:00Z'),
          endedAt: new Date('2026-04-15T09:00:00Z'),
          deletedAt: new Date('2026-04-25T00:00:00Z'),
        },
      });
      const result = await purgeOldDeleted(tx, new Date('2026-05-03T00:00:00Z'));
      expect(result.purged).toBe(1);
      expect(await tx.timeEntry.findUnique({ where: { id: old.id } })).toBeNull();
      expect(await tx.timeEntry.findUnique({ where: { id: recent.id } })).not.toBeNull();
    });
  });

  it('US-92: admin sees deleted entries in trash; owning member sees their own too', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'trash');
      const a = await startTimer(tx, w.user, { companyId: w.company });
      if (!a.ok) throw new Error('setup');
      await softDeleteEntry(tx, w.user, a.value.id);
      const trash = await listTrash(tx, w.admin, w.company);
      expect(trash.ok).toBe(true);
      if (trash.ok) expect(trash.value.find((e) => e.id === a.value.id)).toBeTruthy();
      const userView = await listTrash(tx, w.user, w.company);
      expect(userView.ok).toBe(true);
      if (userView.ok) expect(userView.value.find((e) => e.id === a.value.id)).toBeTruthy();
    });
  });

  it('US-59: startTimer/updateEntry/stopTimer forward source to audit', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'src');
      const s = await startTimer(
        tx,
        w.user,
        { companyId: w.company, description: 'mcp start' },
        undefined, // now
        { source: 'mcp' },
      );
      if (!s.ok) throw new Error('startTimer');
      await updateEntry(tx, w.user, s.value.id, { description: 'mcp edit' }, undefined, {
        source: 'mcp',
      });
      await stopTimer(tx, w.user, s.value.id, undefined, { source: 'mcp' });

      const rows = await tx.auditLog.findMany({
        where: { entityId: s.value.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true, source: true },
      });
      expect(rows).toEqual([
        { action: 'create', source: 'mcp' },
        { action: 'update', source: 'mcp' },
        { action: 'update', source: 'mcp' },
      ]);
    });
  });

  it('US-57: listRunningEntries returns only endedAt-null entries for the user', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'lr');
      const a = await startTimer(tx, w.user, { companyId: w.company, description: 'a' });
      const b = await startTimer(tx, w.user, { companyId: w.company, description: 'b' });
      if (!a.ok || !b.ok) throw new Error('setup');
      await stopTimer(tx, w.user, a.value.id);

      const res = await listRunningEntries(tx, w.user, w.company);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.map((e) => e.id)).toEqual([b.value.id]);
    });
  });

  it('listRecentEntries returns most-recent first up to limit', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'lre');
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await startTimer(tx, w.user, {
          companyId: w.company,
          description: `e${i}`,
        });
        if (!r.ok) throw new Error('setup');
        ids.push(r.value.id);
        await stopTimer(tx, w.user, r.value.id);
      }
      const res = await listRecentEntries(tx, w.user, w.company, 2);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    });
  });

  it('listRunningEntries returns not_found for a non-member', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'lrx');
      const res = await listRunningEntries(tx, w.outsider, w.company);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('not_found');
    });
  });

  it('US-26: listRecentHistory returns completed entries in the ~2-month window, newest-first, company-scoped', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us26hist');
      const now = new Date('2026-06-02T09:00:00Z');
      // In window (May), completed:
      await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T10:00:00Z'),
        },
        now,
      );
      // In window (June), completed, newer:
      await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-06-01T08:00:00Z'),
          endedAt: new Date('2026-06-01T09:00:00Z'),
        },
        now,
      );
      // Out of window (March):
      await createManualEntry(
        tx,
        w.user,
        {
          companyId: w.company,
          startedAt: new Date('2026-03-01T08:00:00Z'),
          endedAt: new Date('2026-03-01T09:00:00Z'),
        },
        now,
      );
      // Running (no endedAt) — must be excluded from history:
      await startTimer(tx, w.user, { companyId: w.company });

      const res = await listRecentHistory(tx, w.user, w.company, now);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.map((e) => e.startedAt.toISOString())).toEqual([
        '2026-06-01T08:00:00.000Z',
        '2026-05-10T08:00:00.000Z',
      ]);
      expect(res.value.every((e) => e.endedAt !== null)).toBe(true);

      // Cross-company isolation: an outsider (no membership) gets not_found.
      const cross = await listRecentHistory(tx, w.outsider, w.company, now);
      expect(cross.ok).toBe(false);
      if (!cross.ok) expect(cross.reason).toBe('not_found');
    });
  });
});
