/**
 * Clients, projects, and tags — the "catalog" admins maintain and
 * users pick from. Tags are unique here: any member (incl. non-admin)
 * can create one inline while filling out a time entry (US-17), but
 * only admins can rename / recolor / delete (US-16).
 *
 * Archive vs. delete: PRD §3.2 — archiving keeps history readable but
 * hides from new-timer pickers (callers filter `archived=false` for
 * pickers and ignore the flag for history views). Delete-with-cascade
 * is parameterized at the API layer via `cascade: boolean` (US-15).
 */
import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { writeAudit } from './audit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

async function getMembershipOrNull(
  db: Db,
  userId: string,
  companyId: string,
): Promise<{ role: Role } | null> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return m ? { role: m.role } : null;
}

async function requireAdmin(
  db: Db,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const m = await getMembershipOrNull(db, userId, companyId);
  if (!m || m.role !== 'admin') return { ok: false, reason: 'not_found' };
  return { ok: true };
}

async function requireMember(
  db: Db,
  userId: string,
  companyId: string,
): Promise<{ ok: true; role: Role } | { ok: false; reason: 'not_found' }> {
  const m = await getMembershipOrNull(db, userId, companyId);
  if (!m) return { ok: false, reason: 'not_found' };
  return { ok: true, role: m.role };
}

// --- Clients ---
export async function createClient(
  db: Db,
  actorUserId: string,
  input: { companyId: string; name: string },
): Promise<Result<{ id: string }>> {
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;
  const c = await db.client.create({ data: { companyId: input.companyId, name: input.name } });
  return { ok: true, value: { id: c.id } };
}

export async function renameClient(
  db: Db,
  actorUserId: string,
  clientId: string,
  name: string,
): Promise<Result<true, 'not_found' | 'invalid'>> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return { ok: false, reason: 'invalid' };
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return { ok: false, reason: 'not_found' };
  await db.client.update({ where: { id: clientId }, data: { name: trimmed } });
  return { ok: true, value: true };
}

export async function archiveClient(
  db: Db,
  actorUserId: string,
  clientId: string,
  archived: boolean,
): Promise<Result<true>> {
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return auth;
  await db.client.update({ where: { id: clientId }, data: { archived } });
  return { ok: true, value: true };
}

export async function deleteClient(
  db: Db,
  actorUserId: string,
  clientId: string,
  options: { cascade: boolean },
): Promise<Result<{ entriesAffected: number }>> {
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return auth;

  const linked = await db.timeEntry.count({ where: { clientId, deletedAt: null } });
  // Sequential ops: soft-delete linked entries first (if cascade), then delete
  // the client. The FK SetNull rule on TimeEntry.clientId orphans any non-cascaded
  // entries. Atomicity is provided by the caller's transaction context if it
  // supplies one (route layer wraps mutations in tx); the few-ms gap is
  // acceptable here.
  if (options.cascade) {
    await db.timeEntry.updateMany({
      where: { clientId },
      data: { deletedAt: new Date() },
    });
  }
  await db.client.delete({ where: { id: clientId } });
  return { ok: true, value: { entriesAffected: linked } };
}

export async function listClients(
  db: Db,
  actorUserId: string,
  companyId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Result<{ id: string; name: string; archived: boolean }[]>> {
  const auth = await requireMember(db, actorUserId, companyId);
  if (!auth.ok) return auth;
  const rows = await db.client.findMany({
    where: { companyId, ...(opts.includeArchived ? {} : { archived: false }) },
    orderBy: { name: 'asc' },
  });
  return {
    ok: true,
    value: rows.map((c) => ({ id: c.id, name: c.name, archived: c.archived })),
  };
}

export interface ClientFundPatch {
  fundInDashboard: boolean;
  weeklyFundMinutes: number | null;
  weekStartsOn: number | null;
  workingDays: number[];
}

export async function updateClientFund(
  db: Db,
  actorUserId: string,
  clientId: string,
  patch: ClientFundPatch,
): Promise<Result<true, 'not_found' | 'invalid'>> {
  // validate: ISO weekdays 1..7, positive minutes when enabled
  const isoOk = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 7);
  const daysOk = patch.workingDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const minutesOk =
    patch.weeklyFundMinutes === null ||
    (Number.isInteger(patch.weeklyFundMinutes) && patch.weeklyFundMinutes > 0);
  if (!isoOk(patch.weekStartsOn) || !daysOk || !minutesOk) return { ok: false, reason: 'invalid' };
  if (patch.fundInDashboard && (patch.weeklyFundMinutes === null || patch.weekStartsOn === null)) {
    return { ok: false, reason: 'invalid' };
  }

  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return { ok: false, reason: 'not_found' };

  const dedupSortedDays = [...new Set(patch.workingDays)].sort((a, b) => a - b);
  await db.client.update({
    where: { id: clientId },
    data: {
      fundInDashboard: patch.fundInDashboard,
      weeklyFundMinutes: patch.weeklyFundMinutes,
      weekStartsOn: patch.weekStartsOn,
      workingDays: dedupSortedDays,
    },
  });
  await writeAudit(db, {
    companyId: c.companyId,
    actorUserId,
    action: 'update',
    entityType: 'client_fund',
    entityId: clientId,
    before: {
      fundInDashboard: c.fundInDashboard,
      weeklyFundMinutes: c.weeklyFundMinutes,
      weekStartsOn: c.weekStartsOn,
      workingDays: c.workingDays,
    },
    after: { ...patch, workingDays: dedupSortedDays },
  });
  return { ok: true, value: true };
}

export async function reorderClients(
  db: Db,
  actorUserId: string,
  input: { companyId: string; orderedIds: string[] },
): Promise<Result<true>> {
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;

  const active = await db.client.findMany({
    where: { companyId: input.companyId, archived: false },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  const activeIds = new Set(active.map((c) => c.id));
  const requested = new Set(input.orderedIds);
  if (
    input.orderedIds.length !== activeIds.size ||
    requested.size !== input.orderedIds.length ||
    [...requested].some((id) => !activeIds.has(id))
  ) {
    return { ok: false, reason: 'not_found' };
  }

  const before = active.map((c) => c.id);

  await Promise.all(
    input.orderedIds.map((id, i) =>
      db.client.update({ where: { id }, data: { sortOrder: i + 1 } }),
    ),
  );

  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'reorder',
    entityType: 'client_order',
    entityId: input.companyId,
    before: { ids: before },
    after: { ids: input.orderedIds },
  });

  return { ok: true, value: true };
}

// --- Projects ---
export async function createProject(
  db: Db,
  actorUserId: string,
  input: { clientId: string; name: string },
): Promise<Result<{ id: string }>> {
  const c = await db.client.findUnique({ where: { id: input.clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return auth;
  const p = await db.project.create({ data: { clientId: input.clientId, name: input.name } });
  await writeAudit(db, {
    companyId: c.companyId,
    actorUserId,
    action: 'create',
    entityType: 'Project',
    entityId: p.id,
    after: { clientId: input.clientId, name: input.name },
  });
  return { ok: true, value: { id: p.id } };
}

export async function renameProject(
  db: Db,
  actorUserId: string,
  projectId: string,
  name: string,
): Promise<Result<true, 'not_found' | 'invalid'>> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return { ok: false, reason: 'invalid' };
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!p) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, p.client.companyId);
  if (!auth.ok) return { ok: false, reason: 'not_found' };
  await db.project.update({ where: { id: projectId }, data: { name: trimmed } });
  return { ok: true, value: true };
}

export async function archiveProject(
  db: Db,
  actorUserId: string,
  projectId: string,
  archived: boolean,
): Promise<Result<true>> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!p) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, p.client.companyId);
  if (!auth.ok) return auth;
  await db.project.update({ where: { id: projectId }, data: { archived } });
  return { ok: true, value: true };
}

export async function deleteProject(
  db: Db,
  actorUserId: string,
  projectId: string,
  options: { cascade: boolean },
): Promise<Result<{ entriesAffected: number }>> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!p) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, p.client.companyId);
  if (!auth.ok) return auth;

  const linked = await db.timeEntry.count({ where: { projectId, deletedAt: null } });
  if (options.cascade) {
    await db.timeEntry.updateMany({
      where: { projectId },
      data: { deletedAt: new Date() },
    });
  }
  await db.project.delete({ where: { id: projectId } });
  return { ok: true, value: { entriesAffected: linked } };
}

export async function reorderProjects(
  db: Db,
  actorUserId: string,
  input: { companyId: string; clientId: string; orderedIds: string[] },
): Promise<Result<true>> {
  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: { companyId: true },
  });
  if (!client || client.companyId !== input.companyId) {
    return { ok: false, reason: 'not_found' };
  }
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;

  const active = await db.project.findMany({
    where: { clientId: input.clientId, archived: false },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  const activeIds = new Set(active.map((p) => p.id));
  const requested = new Set(input.orderedIds);
  if (
    input.orderedIds.length !== activeIds.size ||
    requested.size !== input.orderedIds.length ||
    [...requested].some((id) => !activeIds.has(id))
  ) {
    return { ok: false, reason: 'not_found' };
  }

  const before = active.map((p) => p.id);

  await Promise.all(
    input.orderedIds.map((id, i) =>
      db.project.update({ where: { id }, data: { sortOrder: i + 1 } }),
    ),
  );

  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'reorder',
    entityType: 'project_order',
    entityId: input.clientId,
    before: { ids: before },
    after: { ids: input.orderedIds },
  });

  return { ok: true, value: true };
}

// --- Tags ---
export async function createTag(
  db: Db,
  actorUserId: string,
  input: { companyId: string; name: string; color?: string },
): Promise<Result<{ id: string }>> {
  // US-17: any member (admin or user) can create a tag inline.
  const auth = await requireMember(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;
  const tag = await db.tag.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
    },
  });
  return { ok: true, value: { id: tag.id } };
}

export async function updateTag(
  db: Db,
  actorUserId: string,
  tagId: string,
  patch: { name?: string; color?: string },
): Promise<Result<true>> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag) return { ok: false, reason: 'not_found' };
  // Only admins can rename / recolor (US-16).
  const auth = await requireAdmin(db, actorUserId, tag.companyId);
  if (!auth.ok) return auth;
  await db.tag.update({ where: { id: tagId }, data: patch });
  return { ok: true, value: true };
}

export async function deleteTag(db: Db, actorUserId: string, tagId: string): Promise<Result<true>> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, tag.companyId);
  if (!auth.ok) return auth;
  await db.tag.delete({ where: { id: tagId } });
  return { ok: true, value: true };
}

export async function listProjects(
  db: Db,
  actorUserId: string,
  companyId: string,
  opts: { includeArchived?: boolean; clientId?: string } = {},
): Promise<Result<{ id: string; name: string; clientId: string; archived: boolean }[]>> {
  const auth = await requireMember(db, actorUserId, companyId);
  if (!auth.ok) return auth;
  const rows = await db.project.findMany({
    where: {
      client: { companyId },
      ...(opts.includeArchived ? {} : { archived: false }),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
    orderBy: [{ clientId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return {
    ok: true,
    value: rows.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      archived: p.archived,
    })),
  };
}

export async function listTags(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<Result<{ id: string; name: string; color: string }[]>> {
  const auth = await requireMember(db, actorUserId, companyId);
  if (!auth.ok) return auth;
  const rows = await db.tag.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  return {
    ok: true,
    value: rows.map((t) => ({ id: t.id, name: t.name, color: t.color })),
  };
}
