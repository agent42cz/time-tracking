/**
 * Companies + memberships + invite lifecycle.
 *
 * All admin-only operations require the caller to be Admin in the company
 * (the route layer enforces session→user→membership lookups). These
 * service functions accept an `actorUserId` and re-check the role inline
 * — defense in depth.
 *
 * Cross-company isolation: every read/mutation that targets a company
 * requires (actor, companyId) to share an active membership; if not, the
 * function returns `{ ok: false, reason: 'not_found' }` (per PRD §14.6,
 * 404 not 403, to avoid existence leaks).
 */
import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { generateToken } from '../auth/tokens.js';

type Db = PrismaClient | Prisma.TransactionClient;

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

async function uniqueSlug(db: Db, base: string): Promise<string> {
  let slug = base || 'company';
  let n = 1;
  // 50 retries — collisions are vanishingly rare beyond a handful.
  while (await db.company.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base || 'company'}-${n}`;
    if (n > 50) throw new Error('Could not find unique slug');
  }
  return slug;
}

export async function createCompany(
  db: Db,
  input: { name: string; createdByUserId: string },
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(db, slugify(input.name));
  const company = await db.company.create({
    data: { name: input.name, slug, createdById: input.createdByUserId },
  });
  await db.membership.create({
    data: { userId: input.createdByUserId, companyId: company.id, role: 'admin' },
  });
  return { id: company.id, slug: company.slug };
}

export async function listMyCompanies(
  db: Db,
  userId: string,
): Promise<{ id: string; name: string; slug: string; role: Role }[]> {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    slug: m.company.slug,
    role: m.role,
  }));
}

export async function getMembership(
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
  actorUserId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const m = await getMembership(db, actorUserId, companyId);
  if (!m || m.role !== 'admin') return { ok: false, reason: 'not_found' };
  return { ok: true };
}

// ---- Invites ----
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteResult<T> = { ok: true; value: T } | { ok: false; reason: 'not_found' };

export async function createInvite(
  db: Db,
  actorUserId: string,
  input: { companyId: string; email: string; role: Role },
  now: Date = new Date(),
): Promise<InviteResult<{ id: string; token: string; expiresAt: Date }>> {
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS);
  const invite = await db.invite.create({
    data: {
      companyId: input.companyId,
      email: input.email.toLowerCase(),
      role: input.role,
      token,
      expiresAt,
      invitedById: actorUserId,
      status: 'pending',
    },
  });
  return { ok: true, value: { id: invite.id, token, expiresAt } };
}

export async function revokeInvite(
  db: Db,
  actorUserId: string,
  inviteId: string,
): Promise<InviteResult<true>> {
  const invite = await db.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, invite.companyId);
  if (!auth.ok) return auth;
  if (invite.status !== 'pending') return { ok: false, reason: 'not_found' };
  await db.invite.update({ where: { id: inviteId }, data: { status: 'revoked' } });
  return { ok: true, value: true };
}

export async function resendInvite(
  db: Db,
  actorUserId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<InviteResult<{ token: string; expiresAt: Date }>> {
  const invite = await db.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, invite.companyId);
  if (!auth.ok) return auth;
  if (invite.status !== 'pending') return { ok: false, reason: 'not_found' };
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS);
  await db.invite.update({ where: { id: inviteId }, data: { token, expiresAt } });
  return { ok: true, value: { token, expiresAt } };
}

// ---- Roles & memberships ----
export async function changeRole(
  db: Db,
  actorUserId: string,
  input: { companyId: string; targetUserId: string; newRole: Role },
): Promise<InviteResult<true> | { ok: false; reason: 'last_admin' | 'self_demotion' }> {
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;
  const target = await db.membership.findUnique({
    where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
  });
  if (!target) return { ok: false, reason: 'not_found' };
  if (target.role === input.newRole) return { ok: true, value: true };

  // US-50: cannot demote the last admin. PRD wording wins over self_demotion
  // when both apply, so the "only admin" case keeps the historical reason.
  if (target.role === 'admin' && input.newRole === 'user') {
    const adminCount = await db.membership.count({
      where: { companyId: input.companyId, role: 'admin' },
    });
    if (adminCount <= 1) return { ok: false, reason: 'last_admin' };
  }
  // Self-demotion guard: an admin cannot demote themselves even if other
  // admins exist. Removes the foot-gun where someone clicks "Degradovat" on
  // their own row and accidentally locks themselves out of admin functions.
  if (input.targetUserId === actorUserId && input.newRole === 'user') {
    return { ok: false, reason: 'self_demotion' };
  }

  await db.membership.update({
    where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
    data: { role: input.newRole },
  });
  return { ok: true, value: true };
}

export async function removeMember(
  db: Db,
  actorUserId: string,
  input: { companyId: string; targetUserId: string },
): Promise<InviteResult<true> | { ok: false; reason: 'last_admin' }> {
  const auth = await requireAdmin(db, actorUserId, input.companyId);
  if (!auth.ok) return auth;
  const target = await db.membership.findUnique({
    where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
  });
  if (!target) return { ok: false, reason: 'not_found' };

  // US-50: cannot remove the last admin.
  if (target.role === 'admin') {
    const adminCount = await db.membership.count({
      where: { companyId: input.companyId, role: 'admin' },
    });
    if (adminCount <= 1) return { ok: false, reason: 'last_admin' };
  }

  // PRD §3.3: removing a member preserves their time entries under their name.
  // Memberships cascade-delete is handled by the FK; entries reference user_id
  // independently and stay intact.
  await db.membership.delete({
    where: { userId_companyId: { userId: input.targetUserId, companyId: input.companyId } },
  });
  return { ok: true, value: true };
}

export async function leaveCompany(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<InviteResult<true> | { ok: false; reason: 'last_admin' }> {
  const m = await getMembership(db, actorUserId, companyId);
  if (!m) return { ok: false, reason: 'not_found' };
  if (m.role === 'admin') {
    const adminCount = await db.membership.count({ where: { companyId, role: 'admin' } });
    if (adminCount <= 1) return { ok: false, reason: 'last_admin' };
  }
  await db.membership.delete({
    where: { userId_companyId: { userId: actorUserId, companyId } },
  });
  return { ok: true, value: true };
}

export async function deleteCompany(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<InviteResult<true>> {
  const auth = await requireAdmin(db, actorUserId, companyId);
  if (!auth.ok) return auth;
  // Cascade FKs handle clients/projects/tags/entries/audit/memberships.
  await db.company.delete({ where: { id: companyId } });
  return { ok: true, value: true };
}
