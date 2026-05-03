/**
 * Admin-only audit log read surface.
 *
 * Filters per PRD §8.1 / §9: actor, action, entity, date range, with cursor
 * pagination. The route layer enforces admin role; this function additionally
 * re-checks (defense in depth) and returns `not_found` for non-admins so
 * cross-company calls leak no existence.
 */
import type { AuditAction, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditFilters {
  companyId: string;
  actorUserId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

export interface AuditRowDto {
  id: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listAuditLog(
  db: Db,
  actorUserId: string,
  filters: AuditFilters,
): Promise<Result<{ rows: AuditRowDto[]; nextCursor: string | null }>> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId: filters.companyId } },
  });
  if (!m || m.role !== 'admin') return { ok: false, reason: 'not_found' };

  const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));

  const where: Prisma.AuditLogWhereInput = { companyId: filters.companyId };
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lt = filters.to;
  }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  return {
    ok: true,
    value: {
      rows: trimmed.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt,
      })),
      nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
    },
  };
}
