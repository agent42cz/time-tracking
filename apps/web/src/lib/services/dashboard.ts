/**
 * Admin dashboard queries (PRD §7).
 *
 * Each function corresponds to one of the six widgets and is tested
 * against a deterministic seed so the result row counts / aggregates
 * match a hand-rolled SQL ground truth.
 *
 * `range` always denotes a half-open interval `[start, end)` so callers
 * pass period boundaries from `@tt/shared/time#getPeriodRange`.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { dayKey } from '../time-format';

type Db = PrismaClient | Prisma.TransactionClient;

interface DateRange {
  start: Date;
  end: Date;
}

export type DashResult<T> = { ok: true; value: T } | { ok: false; reason: 'not_found' };

async function requireAdmin(db: Db, actorUserId: string, companyId: string): Promise<boolean> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId } },
  });
  return !!m && m.role === 'admin';
}

function durationMs(e: { startedAt: Date; endedAt: Date | null }): number {
  return (e.endedAt ?? new Date()).getTime() - e.startedAt.getTime();
}

// 1. Headline KPIs.
export async function headlineKpis(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
): Promise<
  DashResult<{
    totalMs: number;
    activeMembers: number;
    distinctClients: number;
    distinctProjects: number;
  }>
> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const entries = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
  });
  const totalMs = entries.reduce((acc, e) => acc + durationMs(e), 0);
  const activeMembers = new Set(entries.map((e) => e.userId)).size;
  const distinctClients = new Set(entries.map((e) => e.clientId).filter(Boolean)).size;
  const distinctProjects = new Set(entries.map((e) => e.projectId).filter(Boolean)).size;
  return {
    ok: true,
    value: { totalMs, activeMembers, distinctClients, distinctProjects },
  };
}

// 2. People × Time table.
export async function peopleTotals(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
): Promise<DashResult<{ userId: string; fullName: string; totalMs: number }[]>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const memberships = await db.membership.findMany({
    where: { companyId },
    include: { user: true },
  });
  const entries = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
  });
  const byUser = new Map<string, number>();
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + durationMs(e));
  return {
    ok: true,
    value: memberships.map((m) => ({
      userId: m.userId,
      fullName: m.user.fullName,
      totalMs: byUser.get(m.userId) ?? 0,
    })),
  };
}

// 3. Time-by-client share.
export async function clientShare(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
): Promise<DashResult<{ clientId: string | null; clientName: string; totalMs: number }[]>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const entries = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
    include: { client: true },
  });
  const buckets = new Map<string | null, { name: string; totalMs: number }>();
  for (const e of entries) {
    const key = e.clientId;
    const existing = buckets.get(key);
    const dur = durationMs(e);
    if (existing) {
      existing.totalMs += dur;
    } else {
      buckets.set(key, {
        name: e.client?.name ?? 'Nepřiřazený klient',
        totalMs: dur,
      });
    }
  }
  return {
    ok: true,
    value: Array.from(buckets.entries()).map(([clientId, b]) => ({
      clientId,
      clientName: b.name,
      totalMs: b.totalMs,
    })),
  };
}

// 4. Top projects.
export async function topProjects(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
  limit = 10,
): Promise<DashResult<{ projectId: string | null; projectName: string; totalMs: number }[]>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const entries = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
    include: { project: true },
  });
  const buckets = new Map<string | null, { name: string; totalMs: number }>();
  for (const e of entries) {
    const dur = durationMs(e);
    const existing = buckets.get(e.projectId);
    if (existing) existing.totalMs += dur;
    else buckets.set(e.projectId, { name: e.project?.name ?? 'Nepřiřazený projekt', totalMs: dur });
  }
  const list = Array.from(buckets.entries())
    .map(([id, b]) => ({ projectId: id, projectName: b.name, totalMs: b.totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, limit);
  return { ok: true, value: list };
}

// 5. Inactive users.
export async function inactiveUsers(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
): Promise<DashResult<{ userId: string; fullName: string }[]>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const memberships = await db.membership.findMany({
    where: { companyId },
    include: { user: true },
  });
  const active = new Set(
    (
      await db.timeEntry.findMany({
        where: {
          companyId,
          deletedAt: null,
          startedAt: { gte: range.start, lt: range.end },
        },
        select: { userId: true },
      })
    ).map((e) => e.userId),
  );
  return {
    ok: true,
    value: memberships
      .filter((m) => !active.has(m.userId))
      .map((m) => ({ userId: m.userId, fullName: m.user.fullName })),
  };
}

// 6. Daily breakdown stacked by client (default) or by user.
export async function dailyBreakdown(
  db: Db,
  actorUserId: string,
  companyId: string,
  range: DateRange,
  groupBy: 'client' | 'user' = 'client',
): Promise<DashResult<{ day: string; key: string; label: string; totalMs: number }[]>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };
  const entries = await db.timeEntry.findMany({
    where: {
      companyId,
      deletedAt: null,
      startedAt: { gte: range.start, lt: range.end },
    },
    include: { client: true, user: true },
  });
  const out = new Map<string, { day: string; key: string; label: string; totalMs: number }>();
  for (const e of entries) {
    const day = dayKey(e.startedAt);
    const key = groupBy === 'client' ? (e.clientId ?? 'none') : e.userId;
    const label = groupBy === 'client' ? (e.client?.name ?? 'Nepřiřazený klient') : e.user.fullName;
    const k = `${day}|${key}`;
    const existing = out.get(k);
    if (existing) existing.totalMs += durationMs(e);
    else out.set(k, { day, key, label, totalMs: durationMs(e) });
  }
  return { ok: true, value: Array.from(out.values()) };
}
