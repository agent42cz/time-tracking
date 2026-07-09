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
import {
  weekRangeFor,
  isoWorkingDayCountInMonth,
  daysInMonthCount,
  getPeriodRange,
  now,
} from '@tt/shared/time';

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

// 7. Client work-fund progress (team-wide weekly/monthly bars + day breakdown).
export interface FundBar {
  targetMinutes: number;
  workedMinutes: number;
}
export interface FundDay {
  isoWeekday: number; // 1..7
  date: string; // 'YYYY-MM-DD' Prague
  targetMinutes: number; // dailyTarget
  allocatedMinutes: number; // greedy fill
  isPast: boolean; // day is strictly before today (Prague)
}
export interface ClientFund {
  clientId: string;
  clientName: string;
  weekly: FundBar;
  monthly: FundBar;
  days: FundDay[]; // [] for hours-only clients
}
export interface FundProgress {
  clients: ClientFund[];
  combined: { weekly: FundBar; monthly: FundBar };
}

const MIN = 60_000;
function dateKeyPrague(d: Date): string {
  return dayKey(d); // dayKey already formats YYYY-MM-DD in Prague
}

export async function clientFundProgress(
  db: Db,
  actorUserId: string,
  companyId: string,
  reference: Date = now(),
): Promise<DashResult<FundProgress>> {
  if (!(await requireAdmin(db, actorUserId, companyId))) return { ok: false, reason: 'not_found' };

  const clients = await db.client.findMany({
    where: { companyId, fundInDashboard: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const month = getPeriodRange('month', reference); // inclusive end, fine for gte/lt below with +1ms guard
  const monthEndExclusive = new Date(month.end.getTime() + 1);
  const todayKey = dateKeyPrague(reference);

  const out: ClientFund[] = [];
  for (const c of clients) {
    const weeklyTarget = c.weeklyFundMinutes ?? 0;
    const wd = c.workingDays ?? [];
    const weekStartsOn = c.weekStartsOn ?? 1;
    const week = weekRangeFor(weekStartsOn, reference);

    const weekEntries = await db.timeEntry.findMany({
      where: {
        companyId,
        clientId: c.id,
        deletedAt: null,
        startedAt: { gte: week.start, lt: week.end },
      },
      select: { startedAt: true, endedAt: true },
    });
    const monthEntries = await db.timeEntry.findMany({
      where: {
        companyId,
        clientId: c.id,
        deletedAt: null,
        startedAt: { gte: month.start, lt: monthEndExclusive },
      },
      select: { startedAt: true, endedAt: true },
    });
    const weekWorked = Math.round(weekEntries.reduce((a, e) => a + durationMs(e), 0) / MIN);
    const monthWorked = Math.round(monthEntries.reduce((a, e) => a + durationMs(e), 0) / MIN);

    // monthly target
    let monthlyTarget: number;
    if (wd.length > 0) {
      const dailyTarget = Math.round(weeklyTarget / wd.length);
      monthlyTarget = isoWorkingDayCountInMonth(wd, reference) * dailyTarget;
    } else {
      monthlyTarget = Math.round((weeklyTarget * daysInMonthCount(reference)) / 7);
    }

    // per-day greedy allocation (working-days clients only)
    const days: FundDay[] = [];
    if (wd.length > 0) {
      const dailyTarget = Math.round(weeklyTarget / wd.length);
      let remaining = weekWorked;
      const ordered = [...wd].sort((a, b) => {
        const da = (a - weekStartsOn + 7) % 7;
        const dbb = (b - weekStartsOn + 7) % 7;
        return da - dbb;
      });
      for (const iso of ordered) {
        const offset = (iso - weekStartsOn + 7) % 7;
        const dayDate = new Date(week.start.getTime() + offset * 24 * 60 * MIN);
        const allocated = Math.min(remaining, dailyTarget);
        remaining -= allocated;
        const key = dateKeyPrague(dayDate);
        days.push({
          isoWeekday: iso,
          date: key,
          targetMinutes: dailyTarget,
          allocatedMinutes: allocated,
          isPast: key < todayKey,
        });
      }
    }

    out.push({
      clientId: c.id,
      clientName: c.name,
      weekly: { targetMinutes: weeklyTarget, workedMinutes: weekWorked },
      monthly: { targetMinutes: monthlyTarget, workedMinutes: monthWorked },
      days,
    });
  }

  const combined = {
    weekly: {
      targetMinutes: out.reduce((a, c) => a + c.weekly.targetMinutes, 0),
      workedMinutes: out.reduce((a, c) => a + c.weekly.workedMinutes, 0),
    },
    monthly: {
      targetMinutes: out.reduce((a, c) => a + c.monthly.targetMinutes, 0),
      workedMinutes: out.reduce((a, c) => a + c.monthly.workedMinutes, 0),
    },
  };
  return { ok: true, value: { clients: out, combined } };
}
