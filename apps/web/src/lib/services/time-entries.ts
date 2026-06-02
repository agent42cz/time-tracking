/**
 * Time entries (PRD §5).
 *
 * Behaviors:
 *  - startTimer: any number running concurrently per user (US-21).
 *  - stopTimer: sets endedAt = now() (or supplied), only the owner can stop.
 *  - createManual: end > start required; future timestamps rejected; any
 *    past date allowed (US-19, US-20, US-22, US-23).
 *  - updateEntry: owner edits any field; admins of the company can edit
 *    anyone's entry (US-24, US-28). Tag list is reset to the supplied
 *    `tagIds` (none → no tags).
 *  - softDelete / restore: owners can soft-delete their own; admins can
 *    soft-delete any. Both produce an audit row. Soft-deleted entries
 *    are hidden from normal queries (US-25, US-47).
 *  - listForUser / listWeek: deleted entries are filtered out by default.
 *  - listTrash: admin-only view of deleted entries within the 30-day window.
 *  - purgeOldDeleted: hard-deletes anything soft-deleted >30 days ago
 *    (called by the daily cron job).
 *  - getHistory: returns the audit rows for a single entry (US-27, US-45).
 *  - listRecentHistory: completed entries in the ~2-month timer-history window (US-26).
 */
import type { AuditSource, Prisma, PrismaClient, Role } from '@prisma/client';
import { getPeriodRange } from '@tt/shared/time';
import { writeAudit } from './audit.js';
import { publishTimeEntry } from '../realtime.js';

export interface AuditOpts {
  source?: AuditSource;
}

type Db = PrismaClient | Prisma.TransactionClient;

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_GRACE_MS = 60_000;

async function getMembership(db: Db, userId: string, companyId: string): Promise<Role | null> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return m?.role ?? null;
}

interface ValidWindow {
  startedAt: Date;
  endedAt: Date | null;
}

function validateWindow(
  startedAt: Date,
  endedAt: Date | null,
  now: Date,
): { ok: true } | { ok: false; reason: 'invalid_window' | 'future_timestamp' } {
  if (startedAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    return { ok: false, reason: 'future_timestamp' };
  }
  if (endedAt) {
    if (endedAt.getTime() <= startedAt.getTime()) return { ok: false, reason: 'invalid_window' };
    if (endedAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
      return { ok: false, reason: 'future_timestamp' };
    }
  }
  return { ok: true };
}

async function snapshot(db: Db, id: string): Promise<Record<string, unknown> | null> {
  const e = await db.timeEntry.findUnique({ where: { id }, include: { tags: true } });
  if (!e) return null;
  return {
    description: e.description,
    clientId: e.clientId,
    projectId: e.projectId,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt?.toISOString() ?? null,
    tagIds: e.tags.map((t) => t.tagId).sort(),
    deletedAt: e.deletedAt?.toISOString() ?? null,
  };
}

// --- Start / stop ---
export interface StartTimerInput {
  companyId: string;
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  tagIds?: string[];
}

export async function startTimer(
  db: Db,
  actorUserId: string,
  input: StartTimerInput,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<{ id: string }>> {
  const role = await getMembership(db, actorUserId, input.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const entry = await db.timeEntry.create({
    data: {
      userId: actorUserId,
      companyId: input.companyId,
      description: input.description ?? '',
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      startedAt: now,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((id) => ({ tagId: id })) }
        : undefined,
    },
  });
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'TimeEntry',
    entityId: entry.id,
    after: (await snapshot(db, entry.id)) as never,
    source: audit.source,
  });
  await publishTimeEntry('timer.started', {
    userId: actorUserId,
    companyId: input.companyId,
    entryId: entry.id,
  });
  return { ok: true, value: { id: entry.id } };
}

export async function stopTimer(
  db: Db,
  actorUserId: string,
  entryId: string,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<true, 'not_found' | 'not_running' | 'forbidden'>> {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.deletedAt) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  // Only the owner can stop their own timer.
  if (entry.userId !== actorUserId) return { ok: false, reason: 'forbidden' };
  if (entry.endedAt) return { ok: false, reason: 'not_running' };

  const before = await snapshot(db, entryId);
  await db.timeEntry.update({ where: { id: entryId }, data: { endedAt: now } });
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'update',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
    source: audit.source,
  });
  await publishTimeEntry('timer.stopped', {
    userId: actorUserId,
    companyId: entry.companyId,
    entryId,
  });
  return { ok: true, value: true };
}

// --- Manual entry ---
export interface ManualEntryInput extends StartTimerInput {
  startedAt: Date;
  endedAt: Date;
}

export async function createManualEntry(
  db: Db,
  actorUserId: string,
  input: ManualEntryInput,
  now: Date = new Date(),
): Promise<Result<{ id: string }, 'not_found' | 'invalid_window' | 'future_timestamp'>> {
  const role = await getMembership(db, actorUserId, input.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const v = validateWindow(input.startedAt, input.endedAt, now);
  if (!v.ok) return v;
  const entry = await db.timeEntry.create({
    data: {
      userId: actorUserId,
      companyId: input.companyId,
      description: input.description ?? '',
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((id) => ({ tagId: id })) }
        : undefined,
    },
  });
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'TimeEntry',
    entityId: entry.id,
    after: (await snapshot(db, entry.id)) as never,
  });
  await publishTimeEntry('time_entry.created', {
    userId: actorUserId,
    companyId: input.companyId,
    entryId: entry.id,
  });
  return { ok: true, value: { id: entry.id } };
}

// --- Edit ---
export interface UpdateEntryPatch {
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  startedAt?: Date;
  endedAt?: Date | null;
  tagIds?: string[];
}

export async function updateEntry(
  db: Db,
  actorUserId: string,
  entryId: string,
  patch: UpdateEntryPatch,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<true, 'not_found' | 'invalid_window' | 'future_timestamp'>> {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.deletedAt) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  // Owner OR admin of the company.
  if (entry.userId !== actorUserId && role !== 'admin') {
    return { ok: false, reason: 'not_found' };
  }
  const window: ValidWindow = {
    startedAt: patch.startedAt ?? entry.startedAt,
    endedAt: patch.endedAt === undefined ? entry.endedAt : patch.endedAt,
  };
  const v = validateWindow(window.startedAt, window.endedAt, now);
  if (!v.ok) return v;

  const before = await snapshot(db, entryId);

  const update: Prisma.TimeEntryUpdateInput = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.clientId !== undefined)
    update.client =
      patch.clientId === null ? { disconnect: true } : { connect: { id: patch.clientId } };
  if (patch.projectId !== undefined)
    update.project =
      patch.projectId === null ? { disconnect: true } : { connect: { id: patch.projectId } };
  if (patch.startedAt) update.startedAt = patch.startedAt;
  if (patch.endedAt !== undefined) update.endedAt = patch.endedAt;

  await db.timeEntry.update({ where: { id: entryId }, data: update });
  if (patch.tagIds !== undefined) {
    await db.timeEntryTag.deleteMany({ where: { timeEntryId: entryId } });
    if (patch.tagIds.length > 0) {
      await db.timeEntryTag.createMany({
        data: patch.tagIds.map((tagId) => ({ timeEntryId: entryId, tagId })),
      });
    }
  }

  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'update',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
    source: audit.source,
  });
  await publishTimeEntry('time_entry.updated', {
    userId: entry.userId,
    companyId: entry.companyId,
    entryId,
  });
  return { ok: true, value: true };
}

// --- Soft delete / restore / purge ---
export async function softDeleteEntry(
  db: Db,
  actorUserId: string,
  entryId: string,
  now: Date = new Date(),
): Promise<Result<true>> {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.deletedAt) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  if (entry.userId !== actorUserId && role !== 'admin') return { ok: false, reason: 'not_found' };

  const before = await snapshot(db, entryId);
  await db.timeEntry.update({ where: { id: entryId }, data: { deletedAt: now } });
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'delete',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
  });
  await publishTimeEntry('time_entry.deleted', {
    userId: entry.userId,
    companyId: entry.companyId,
    entryId,
  });
  return { ok: true, value: true };
}

export async function restoreEntry(
  db: Db,
  actorUserId: string,
  entryId: string,
): Promise<Result<true>> {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || !entry.deletedAt) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role || role !== 'admin') return { ok: false, reason: 'not_found' };

  const before = await snapshot(db, entryId);
  await db.timeEntry.update({ where: { id: entryId }, data: { deletedAt: null } });
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'restore',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
  });
  await publishTimeEntry('time_entry.restored', {
    userId: entry.userId,
    companyId: entry.companyId,
    entryId,
  });
  return { ok: true, value: true };
}

/** Daily cron — purges anything soft-deleted >30 days ago. */
export async function purgeOldDeleted(db: Db, now: Date = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  const { count } = await db.timeEntry.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  return { purged: count };
}

// --- Reads ---
export async function listMyWeek(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: { start: Date; end: Date },
): Promise<
  Result<
    {
      id: string;
      description: string;
      startedAt: Date;
      endedAt: Date | null;
      clientId: string | null;
      projectId: string | null;
      tagIds: string[];
    }[]
  >
> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const rows = await db.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
    orderBy: { startedAt: 'asc' },
    include: { tags: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      clientId: r.clientId,
      projectId: r.projectId,
      tagIds: r.tags.map((t) => t.tagId),
    })),
  };
}

export async function listTrash(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<Result<{ id: string; userId: string; deletedAt: Date }[]>> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role || role !== 'admin') return { ok: false, reason: 'not_found' };
  const rows = await db.timeEntry.findMany({
    where: { companyId, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
  });
  return {
    ok: true,
    value: rows.map((r) => ({ id: r.id, userId: r.userId, deletedAt: r.deletedAt! })),
  };
}

export async function listRunningEntries(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<
  Result<
    {
      id: string;
      description: string;
      startedAt: Date;
      clientId: string | null;
      projectId: string | null;
      tagIds: string[];
    }[]
  >
> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const rows = await db.timeEntry.findMany({
    where: { userId: actorUserId, companyId, endedAt: null, deletedAt: null },
    orderBy: { startedAt: 'asc' },
    include: { tags: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      startedAt: r.startedAt,
      clientId: r.clientId,
      projectId: r.projectId,
      tagIds: r.tags.map((t) => t.tagId),
    })),
  };
}

export async function listRecentEntries(
  db: Db,
  actorUserId: string,
  companyId: string,
  limit: number,
): Promise<
  Result<
    {
      id: string;
      description: string;
      startedAt: Date;
      endedAt: Date | null;
      clientId: string | null;
      projectId: string | null;
      tagIds: string[];
    }[]
  >
> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const capped = Math.max(1, Math.min(50, Math.trunc(limit)));
  const rows = await db.timeEntry.findMany({
    where: { userId: actorUserId, companyId, deletedAt: null },
    orderBy: { startedAt: 'desc' },
    take: capped,
    include: { tags: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      clientId: r.clientId,
      projectId: r.projectId,
      tagIds: r.tags.map((t) => t.tagId),
    })),
  };
}

export interface HistoryEntry {
  id: string;
  description: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  tags: { id: string; name: string; color: string }[];
}

/**
 * Completed entries for the timer-page history window: start-of-last-month to
 * max(end-of-this-week, end-of-this-month) — extended to the ISO week end so a
 * week spanning the month boundary isn't cut off. Newest-first, with client /
 * project names + tag colors for the rich rows. Backs both /api/v1/timer and
 * the /timer page SSR.
 */
export async function listRecentHistory(
  db: Db,
  actorUserId: string,
  companyId: string,
  now: Date = new Date(),
): Promise<Result<HistoryEntry[]>> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };

  const weekRange = getPeriodRange('week', now);
  const monthRange = getPeriodRange('month', now);
  const lastMonthRef = new Date(now);
  lastMonthRef.setMonth(lastMonthRef.getMonth() - 1);
  const lastMonthRange = getPeriodRange('month', lastMonthRef);
  const historyEnd =
    weekRange.end.getTime() > monthRange.end.getTime() ? weekRange.end : monthRange.end;

  const rows = await db.timeEntry.findMany({
    where: {
      userId: actorUserId,
      companyId,
      deletedAt: null,
      endedAt: { not: null },
      startedAt: { gte: lastMonthRange.start, lt: historyEnd },
    },
    include: { client: true, project: true, tags: { include: { tag: true } } },
    orderBy: { startedAt: 'desc' },
  });

  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      clientId: r.clientId,
      clientName: r.client?.name ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      tags: r.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    })),
  };
}

export async function getEntryHistory(
  db: Db,
  actorUserId: string,
  entryId: string,
): Promise<
  Result<
    {
      id: string;
      action: string;
      actorUserId: string | null;
      before: unknown;
      after: unknown;
      createdAt: Date;
    }[]
  >
> {
  const entry = await db.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, reason: 'not_found' };
  const role = await getMembership(db, actorUserId, entry.companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  // US-27: any user can view history of their own entry.
  // Admins can view anyone's; users only their own.
  if (entry.userId !== actorUserId && role !== 'admin') return { ok: false, reason: 'not_found' };
  const rows = await db.auditLog.findMany({
    where: { entityType: 'TimeEntry', entityId: entryId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUserId: r.actorUserId,
      before: r.before,
      after: r.after,
      createdAt: r.createdAt,
    })),
  };
}
