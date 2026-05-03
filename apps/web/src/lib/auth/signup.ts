/**
 * Invite-only signup (PRD §2.1, §4.3). There is no public sign-up path.
 *
 * `acceptInvite` redeems a single-use invite token. If the email matches
 * an existing user, that user is added to the company (US-2). If not, a
 * new user is created with the supplied name + password (US-1). The
 * Membership row is created with the role from the invite. The Invite
 * row's status flips to `accepted`.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from './passwords.js';
import { hashToken } from './tokens.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type AcceptInviteResult =
  | {
      ok: true;
      userId: string;
      companyId: string;
      role: 'admin' | 'user';
      created: boolean; // true if the user was newly created
    }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'already_accepted' };

export interface AcceptInviteInput {
  token: string;
  fullName: string;
  password: string;
}

export interface AcceptForExistingUserInput {
  token: string;
  userId: string;
}

export async function loadInviteByToken(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; invite: NonNullable<Awaited<ReturnType<Db['invite']['findUnique']>>> }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'already_accepted' }
> {
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.status === 'accepted') return { ok: false, reason: 'already_accepted' };
  if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
  if (invite.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, invite };
}

export async function acceptInviteAsNewUser(
  db: Db,
  input: AcceptInviteInput,
  now: Date = new Date(),
): Promise<AcceptInviteResult> {
  const loaded = await loadInviteByToken(db, input.token, now);
  if (!loaded.ok) return loaded;
  const invite = loaded.invite;

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: { email: invite.email, fullName: input.fullName, passwordHash },
  });
  await db.membership.create({
    data: { userId: user.id, companyId: invite.companyId, role: invite.role },
  });
  await db.invite.update({
    where: { id: invite.id },
    data: { status: 'accepted', acceptedAt: now },
  });
  return {
    ok: true,
    userId: user.id,
    companyId: invite.companyId,
    role: invite.role,
    created: true,
  };
}

export async function acceptInviteAsExistingUser(
  db: Db,
  input: AcceptForExistingUserInput,
  now: Date = new Date(),
): Promise<AcceptInviteResult> {
  const loaded = await loadInviteByToken(db, input.token, now);
  if (!loaded.ok) return loaded;
  const invite = loaded.invite;

  // Idempotent: if already a member, just mark invite accepted.
  const existing = await db.membership.findUnique({
    where: { userId_companyId: { userId: input.userId, companyId: invite.companyId } },
  });
  if (!existing) {
    await db.membership.create({
      data: { userId: input.userId, companyId: invite.companyId, role: invite.role },
    });
  }
  await db.invite.update({
    where: { id: invite.id },
    data: { status: 'accepted', acceptedAt: now },
  });
  return {
    ok: true,
    userId: input.userId,
    companyId: invite.companyId,
    role: invite.role,
    created: false,
  };
}

export async function createInvite(
  db: Db,
  data: {
    companyId: string;
    email: string;
    role: 'admin' | 'user';
    invitedById: string;
    expiresAt: Date;
    token: string;
  },
): Promise<void> {
  await db.invite.create({
    data: {
      companyId: data.companyId,
      email: data.email.toLowerCase(),
      role: data.role,
      invitedById: data.invitedById,
      expiresAt: data.expiresAt,
      token: data.token,
    },
  });
}

export { hashToken };
