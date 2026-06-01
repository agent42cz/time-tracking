/**
 * Reports service (PRD §8).
 *
 * Filters: date range, clients[], projects[], members[], tags[] (AND/OR),
 * description text. Admin-only sees all members; users only see their own.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { toAppZone } from '@tt/shared/time';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ReportFilters {
  companyId: string;
  from?: Date;
  to?: Date;
  clientIds?: string[];
  projectIds?: string[];
  memberIds?: string[];
  tagIds?: string[];
  tagsMode?: 'and' | 'or';
  search?: string;
}

export interface ReportRow {
  id: string;
  userId: string;
  userName: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  description: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  tags: { id: string; name: string }[];
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
  if (filters.projectIds?.length) where.projectId = { in: filters.projectIds };
  if (filters.search) where.description = { contains: filters.search, mode: 'insensitive' };

  if (filters.tagIds?.length) {
    if (filters.tagsMode === 'and') {
      where.AND = filters.tagIds.map((tagId) => ({ tags: { some: { tagId } } }));
    } else {
      where.tags = { some: { tagId: { in: filters.tagIds } } };
    }
  }

  const rows = await db.timeEntry.findMany({
    where,
    include: {
      user: true,
      client: true,
      project: true,
      tags: { include: { tag: true } },
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
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      description: r.description,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: (r.endedAt ?? new Date()).getTime() - r.startedAt.getTime(),
      tags: r.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name })),
    })),
  };
}

export type GroupBy = 'project' | 'member' | 'day';

export interface ReportGroup {
  key: string;
  label: string;
  clientName: string | null;
  subtotalMs: number;
  rows: ReportRow[];
}

export interface GroupedReport {
  groupBy: GroupBy;
  groups: ReportGroup[];
  grandTotalMs: number;
  rowCount: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Prague-local YYYY-MM-DD bucket (Coolify runs UTC; bucket by the day the user lived).
function pragueDayKey(d: Date): string {
  const z = toAppZone(d);
  return `${z.getFullYear()}-${pad2(z.getMonth() + 1)}-${pad2(z.getDate())}`;
}

function effectiveMs(r: ReportRow, clampEnd?: Date): number {
  if (r.endedAt !== null) {
    // Completed entry — use stored duration (avoids re-deriving from timestamps).
    return r.durationMs;
  }
  // Still-running: clamp at clampEnd, or fall back to now.
  const end = clampEnd ?? new Date();
  return Math.max(0, end.getTime() - r.startedAt.getTime());
}

export function buildGroupedReport(
  rows: ReportRow[],
  opts: { groupBy: GroupBy; clampEnd?: Date },
): GroupedReport {
  const { groupBy, clampEnd } = opts;
  const map = new Map<string, ReportGroup>();

  for (const r of rows) {
    let key: string;
    let label: string;
    let clientName: string | null;
    if (groupBy === 'project') {
      key = r.projectId ?? 'none';
      label = r.projectName ?? 'Bez projektu';
      clientName = r.clientName;
    } else if (groupBy === 'member') {
      key = r.userId;
      label = r.userName;
      clientName = null;
    } else {
      key = pragueDayKey(r.startedAt);
      label = key;
      clientName = null;
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, clientName, subtotalMs: 0, rows: [] };
      map.set(key, g);
    }
    g.subtotalMs += effectiveMs(r, clampEnd);
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
    grandTotalMs: groups.reduce((s, g) => s + g.subtotalMs, 0),
    rowCount: rows.length,
  };
}

// CSV export (PRD §8.2). XLSX/PDF use the same row shape via dedicated
// libraries (xlsx / pdfkit) at the route layer.
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
    'tags',
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
        r.tags.map((t) => t.name).join('|'),
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
