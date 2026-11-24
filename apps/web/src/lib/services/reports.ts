/**
 * Reports service (PRD §8).
 *
 * Filters: date range, clients[], projects[], members[], description text.
 * Admin-only sees all members; users only see their own.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { dayKey } from '@/lib/time-format';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ReportFilters {
  companyId: string;
  from?: Date;
  to?: Date;
  clientIds?: string[];
  projectIds?: string[];
  memberIds?: string[];
  search?: string;
}

export interface ReportRow {
  id: string;
  userId: string;
  userName: string;
  clientId: string | null;
  clientName: string | null;
  clientColor: string | null;
  projectId: string | null;
  projectName: string | null;
  description: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: 'not_found' };

export async function runReport(
  db: Db,
  actorUserId: string,
  filters: ReportFilters,
): Promise<Result<ReportRow[]>> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId: filters.companyId } },
  });
  if (!m) return { ok: false, reason: 'not_found' };

  const where: Prisma.TimeEntryWhereInput = {
    companyId: filters.companyId,
    deletedAt: null,
  };
  // Non-admins can only see their own entries (PRD §2.2).
  if (m.role !== 'admin') {
    where.userId = actorUserId;
  } else if (filters.memberIds?.length) {
    where.userId = { in: filters.memberIds };
  }
  if (filters.from || filters.to) {
    where.startedAt = {};
    if (filters.from) where.startedAt.gte = filters.from;
    if (filters.to) where.startedAt.lt = filters.to;
  }
  if (filters.clientIds?.length) where.clientId = { in: filters.clientIds };
  if (filters.projectIds?.length) {
    const ids = [...new Set(filters.projectIds)];
    const owned = await db.project.count({
      where: { id: { in: ids }, client: { companyId: filters.companyId } },
    });
    // A project from another company is not_found, same as a missing membership,
    // so the export routes answer 404 instead of an empty file.
    if (owned !== ids.length) return { ok: false, reason: 'not_found' };
    where.projectId = { in: ids };
  }
  if (filters.search) where.description = { contains: filters.search, mode: 'insensitive' };

  const rows = await db.timeEntry.findMany({
    where,
    include: {
      user: true,
      client: true,
      project: true,
    },
    orderBy: { startedAt: 'asc' },
  });

  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.fullName,
      clientId: r.clientId,
      clientName: r.client?.name ?? null,
      clientColor: r.client?.color ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      description: r.description,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: (r.endedAt ?? new Date()).getTime() - r.startedAt.getTime(),
    })),
  };
}

export type GroupBy = 'project' | 'member' | 'day';

export function parseGroupBy(v: string | null | undefined): GroupBy {
  return v === 'member' || v === 'day' ? v : 'project';
}

export interface ReportGroup {
  key: string;
  label: string;
  clientName: string | null;
  clientColor: string | null;
  subtotalMs: number;
  rows: ReportRow[];
}

export interface GroupedReport {
  groupBy: GroupBy;
  groups: ReportGroup[];
  grandTotalMs: number;
  rowCount: number;
}

// Effective duration for totals. Base is the row's recorded durationMs (which
// runReport sets to (endedAt ?? now) - startedAt), so this equals durationMs for
// in-period entries. clampEnd caps the tail of entries that run past the period
// end (a still-running timer, or a completed entry that crosses the boundary).
function effectiveMs(r: ReportRow, clampEnd?: Date): number {
  if (!clampEnd) return r.durationMs;
  return Math.max(0, Math.min(r.durationMs, clampEnd.getTime() - r.startedAt.getTime()));
}

export function buildGroupedReport(
  rows: ReportRow[],
  opts: { groupBy: GroupBy; clampEnd?: Date },
): GroupedReport {
  const { groupBy, clampEnd } = opts;
  const map = new Map<string, ReportGroup>();
  let grandTotalMs = 0;

  for (const r of rows) {
    let key: string;
    let label: string;
    let clientName: string | null;
    let clientColor: string | null;
    if (groupBy === 'project') {
      key = r.projectId ?? 'none';
      label = r.projectName ?? 'Bez projektu';
      clientName = r.clientName;
      clientColor = r.clientColor;
    } else if (groupBy === 'member') {
      key = r.userId;
      label = r.userName;
      clientName = null;
      clientColor = null;
    } else {
      key = dayKey(r.startedAt);
      label = key;
      clientName = null;
      clientColor = null;
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, clientName, clientColor, subtotalMs: 0, rows: [] };
      map.set(key, g);
    }
    const ms = effectiveMs(r, clampEnd);
    g.subtotalMs += ms;
    grandTotalMs += ms;
    g.rows.push(r);
  }

  const groups = [...map.values()].sort((a, b) => {
    if (groupBy === 'project') {
      return (
        (a.clientName ?? '').localeCompare(b.clientName ?? '', 'cs') ||
        a.label.localeCompare(b.label, 'cs')
      );
    }
    if (groupBy === 'member') return a.label.localeCompare(b.label, 'cs');
    return a.key.localeCompare(b.key); // 'YYYY-MM-DD' sorts chronologically
  });

  return {
    groupBy,
    groups,
    grandTotalMs,
    rowCount: rows.length,
  };
}

export type SummaryGroupBy = 'client' | 'project' | 'day' | 'member';

export interface SummaryGroup {
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  day: string | null;
  userId: string | null;
  userName: string | null;
  totalMs: number;
  entryCount: number;
}

export interface EntrySummary {
  totalMs: number;
  entryCount: number;
  groups: SummaryGroup[];
}

/**
 * Whose entries the actor may read, by the /reports rules (PRD §2.2): an admin
 * any member of the company, everyone else only themself. Omitted → just the
 * actor. Naming anyone else (a colleague as a non-admin, or a non-member) is
 * not_found rather than a silent fall back to the actor's own rows.
 */
export async function resolveVisibleMembers(
  db: Db,
  actorUserId: string,
  companyId: string,
  memberIds: string[] | undefined,
): Promise<Result<string[]>> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId } },
  });
  if (!m) return { ok: false, reason: 'not_found' };
  const ids = [...new Set(memberIds?.length ? memberIds : [actorUserId])];
  if (m.role !== 'admin') {
    return ids.every((id) => id === actorUserId)
      ? { ok: true, value: ids }
      : { ok: false, reason: 'not_found' };
  }
  const found = await db.membership.count({ where: { companyId, userId: { in: ids } } });
  return found === ids.length ? { ok: true, value: ids } : { ok: false, reason: 'not_found' };
}

/**
 * Time in `[from, to)` of the actor, or of `memberIds` where the /reports rules
 * allow it, grouped for MCP clients that need totals without pulling every row
 * (AIAGE-78). Uses runReport + effectiveMs with `clampEnd: to`, the same inputs
 * as the /reports page, so the numbers match what the user sees there.
 */
export async function summarizeEntries(
  db: Db,
  actorUserId: string,
  filters: Omit<ReportFilters, 'search' | 'from' | 'to'> & {
    from: Date;
    to: Date;
    /** Admins only: every entry in the company, former members' included, like /reports unfiltered. */
    allMembers?: boolean;
  },
  groupBy: SummaryGroupBy,
): Promise<Result<EntrySummary>> {
  // runReport checks project ownership but not client ownership; a foreign
  // client must be not_found here rather than an empty summary.
  const clientIds = [...new Set(filters.clientIds ?? [])];
  if (
    clientIds.length &&
    (await db.client.count({ where: { id: { in: clientIds }, companyId: filters.companyId } })) !==
      clientIds.length
  )
    return { ok: false, reason: 'not_found' };
  let memberIds: string[];
  if (filters.allMembers) {
    const m = await db.membership.findUnique({
      where: { userId_companyId: { userId: actorUserId, companyId: filters.companyId } },
    });
    if (m?.role !== 'admin') return { ok: false, reason: 'not_found' };
    memberIds = []; // runReport: an admin without a member filter sees everyone
  } else {
    const members = await resolveVisibleMembers(
      db,
      actorUserId,
      filters.companyId,
      filters.memberIds,
    );
    if (!members.ok) return members;
    memberIds = members.value;
  }
  const res = await runReport(db, actorUserId, { ...filters, memberIds });
  if (!res.ok) return res;
  const rows = res.value;

  const map = new Map<string, SummaryGroup>();
  let totalMs = 0;
  for (const r of rows) {
    const ms = effectiveMs(r, filters.to);
    totalMs += ms;
    const key =
      groupBy === 'client'
        ? (r.clientId ?? 'none')
        : groupBy === 'project'
          ? (r.projectId ?? 'none') // like /reports: one "Bez projektu" group across clients
          : groupBy === 'member'
            ? r.userId
            : dayKey(r.startedAt);
    let g = map.get(key);
    if (!g) {
      const byClient = groupBy === 'client' || groupBy === 'project';
      g = {
        clientId: byClient && key !== 'none' ? r.clientId : null,
        clientName: byClient && key !== 'none' ? r.clientName : null,
        projectId: groupBy === 'project' ? r.projectId : null,
        projectName: groupBy === 'project' ? r.projectName : null,
        day: groupBy === 'day' ? key : null,
        userId: groupBy === 'member' ? r.userId : null,
        userName: groupBy === 'member' ? r.userName : null,
        totalMs: 0,
        entryCount: 0,
      };
      map.set(key, g);
    }
    g.totalMs += ms;
    g.entryCount++;
  }

  const groups = [...map.values()].sort((a, b) =>
    groupBy === 'day'
      ? a.day!.localeCompare(b.day!)
      : groupBy === 'member'
        ? (a.userName ?? '').localeCompare(b.userName ?? '', 'cs')
        : (a.clientName ?? '').localeCompare(b.clientName ?? '', 'cs') ||
          (a.projectName ?? '').localeCompare(b.projectName ?? '', 'cs'),
  );
  return { ok: true, value: { totalMs, entryCount: rows.length, groups } };
}

// CSV export (PRD §8.2). PDF export reuses ReportRow[] via buildGroupedReport +
// buildReportPdf (pdfmake) at the route layer — see ADR-0010. XLSX is not built.
export function rowsToCsv(rows: ReportRow[]): string {
  const header = [
    'id',
    'user',
    'client',
    'project',
    'description',
    'startedAt',
    'endedAt',
    'durationSec',
  ];
  const escape = (v: string): string => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.userName,
        r.clientName ?? '',
        r.projectName ?? '',
        r.description,
        r.startedAt.toISOString(),
        r.endedAt?.toISOString() ?? '',
        Math.round(r.durationMs / 1000).toString(),
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
