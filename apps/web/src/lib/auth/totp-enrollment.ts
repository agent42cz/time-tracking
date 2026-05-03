/**
 * TOTP enrollment + verification — combines `totp.ts` (code math) with
 * persistence (User.totpSecret/totpEnabled) and recovery codes.
 *
 * Flow:
 *  1. `beginEnrollment(userId)` → returns secret + provisioning URI; persists
 *     the secret but keeps `totpEnabled=false` until confirmed.
 *  2. `confirmEnrollment(userId, code)` → verifies a code against the stored
 *     secret. On success: flips `totpEnabled=true` and generates 10 single-use
 *     recovery codes (returned plaintext once, stored as SHA-256 hashes).
 *  3. `verifyTwoFactor(user, code)` — accepts either a TOTP code OR a recovery
 *     code (consumed on use).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashToken } from './tokens.js';
import { generateRecoveryCodes } from './tokens.js';
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from './totp.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface BegunEnrollment {
  secret: string;
  otpauthUrl: string;
}

export async function beginEnrollment(db: Db, userId: string): Promise<BegunEnrollment> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: secret, totpEnabled: false },
  });
  return { secret, otpauthUrl: buildTotpUri(user.email, secret) };
}

export interface ConfirmedEnrollment {
  recoveryCodes: string[];
}

export async function confirmEnrollment(
  db: Db,
  userId: string,
  code: string,
): Promise<ConfirmedEnrollment> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecret) throw new Error('TOTP enrollment not started');
  if (!verifyTotpCode(user.totpSecret, code)) throw new Error('Invalid TOTP code');

  const recoveryCodes = generateRecoveryCodes(10);
  // Wipe any prior codes and write the new set.
  await db.totpRecoveryCode.deleteMany({ where: { userId } });
  await db.totpRecoveryCode.createMany({
    data: recoveryCodes.map((c) => ({ userId, codeHash: hashToken(c) })),
  });
  await db.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  return { recoveryCodes };
}

export type TwoFactorResult =
  | { ok: true; via: 'totp' | 'recovery' }
  | { ok: false; reason: 'not_enabled' | 'invalid' };

export async function verifyTwoFactor(
  db: Db,
  userId: string,
  code: string,
): Promise<TwoFactorResult> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabled || !user.totpSecret) return { ok: false, reason: 'not_enabled' };

  if (verifyTotpCode(user.totpSecret, code)) return { ok: true, via: 'totp' };

  // Try recovery code.
  const codeHash = hashToken(code);
  const recovery = await db.totpRecoveryCode.findUnique({
    where: { userId_codeHash: { userId, codeHash } },
  });
  if (!recovery || recovery.usedAt) return { ok: false, reason: 'invalid' };
  await db.totpRecoveryCode.update({
    where: { userId_codeHash: { userId, codeHash } },
    data: { usedAt: new Date() },
  });
  return { ok: true, via: 'recovery' };
}

export async function disableTotp(db: Db, userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: null, totpEnabled: false },
  });
  await db.totpRecoveryCode.deleteMany({ where: { userId } });
}
