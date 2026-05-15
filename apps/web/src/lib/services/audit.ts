/**
 * Audit log writer.
 *
 * Every mutation route should call `writeAudit` exactly once. The Phase 6
 * test in `tests/services/audit.test.ts` walks the routes and asserts that
 * every mutation is paired with an audit row.
 *
 * Audit rows are immutable in the API surface — there is no update/delete
 * operation exposed; the route layer would 405 those.
 */
import type { AuditAction, AuditSource, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export interface AuditWriteInput {
  companyId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: JsonValue;
  after?: JsonValue;
  source?: AuditSource;
}

export async function writeAudit(db: Db, input: AuditWriteInput): Promise<void> {
  await db.auditLog.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? null) as Prisma.InputJsonValue,
      after: (input.after ?? null) as Prisma.InputJsonValue,
      source: input.source ?? 'web',
    },
  });
}
