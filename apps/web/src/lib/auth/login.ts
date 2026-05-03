/**
 * The single point where the various auth signals (password, magic-link,
 * TOTP, lockout) compose into a login decision. Returns a discriminated
 * union so callers can render the right UI without duplicating policy.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { verifyPassword } from './passwords.js';
import { redeemMagicLink } from './magic-link.js';
import { verifyTwoFactor } from './totp-enrollment.js';
import { getLockoutStatus, recordAttempt } from './rate-limit.js';
import { createSession } from './sessions.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type LoginResult =
  | { ok: true; userId: string; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid_credentials' | 'locked' | 'totp_required' | 'totp_invalid' };

export interface PasswordLoginInput {
  email: string;
  password: string;
  totpCode?: string;
  ip?: string | null;
}

export async function loginWithPassword(
  db: Db,
  input: PasswordLoginInput,
  now: Date = new Date(),
): Promise<LoginResult> {
  const email = input.email.toLowerCase();
  const lockout = await getLockoutStatus(db, email, now);
  if (lockout.locked) return { ok: false, reason: 'locked' };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await recordAttempt(db, email, false, { ip: input.ip }, now);
    return { ok: false, reason: 'invalid_credentials' };
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    await recordAttempt(db, email, false, { userId: user.id, ip: input.ip }, now);
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (user.totpEnabled) {
    if (!input.totpCode) return { ok: false, reason: 'totp_required' };
    const tf = await verifyTwoFactor(db, user.id, input.totpCode);
    if (!tf.ok) {
      await recordAttempt(db, email, false, { userId: user.id, ip: input.ip }, now);
      return { ok: false, reason: 'totp_invalid' };
    }
  }

  await recordAttempt(db, email, true, { userId: user.id, ip: input.ip }, now);
  const session = await createSession(db, user.id, now);
  return { ok: true, userId: user.id, sessionToken: session.token, expiresAt: session.expiresAt };
}

export interface MagicLoginInput {
  token: string;
  totpCode?: string;
}

export async function loginWithMagicLink(
  db: Db,
  input: MagicLoginInput,
  now: Date = new Date(),
): Promise<LoginResult> {
  const redeem = await redeemMagicLink(db, input.token, now);
  if (!redeem.ok) return { ok: false, reason: 'invalid_credentials' };

  const user = await db.user.findUniqueOrThrow({ where: { id: redeem.userId } });
  if (user.totpEnabled) {
    if (!input.totpCode) return { ok: false, reason: 'totp_required' };
    const tf = await verifyTwoFactor(db, user.id, input.totpCode);
    if (!tf.ok) return { ok: false, reason: 'totp_invalid' };
  }

  const session = await createSession(db, user.id, now);
  return { ok: true, userId: user.id, sessionToken: session.token, expiresAt: session.expiresAt };
}
