import type { Prisma, PrismaClient } from '@prisma/client';
import { generateToken, hashToken } from './tokens.js';

export const PASSWORD_RESET_LIFETIME_MS = 60 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface IssuedPasswordReset {
  token: string;
  expiresAt: Date;
}

export async function issuePasswordReset(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<IssuedPasswordReset> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS);
  await db.passwordReset.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
}

export type PasswordResetRedeemResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

export async function redeemPasswordReset(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<PasswordResetRedeemResult> {
  const tokenHash = hashToken(token);
  const row = await db.passwordReset.findUnique({ where: { tokenHash } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  await db.passwordReset.update({ where: { id: row.id }, data: { usedAt: now } });
  return { ok: true, userId: row.userId };
}
