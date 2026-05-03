/**
 * Magic link issue + redeem (PRD §4.1).
 *
 * - Single use
 * - 15-minute expiry
 * - Token is shown once via email; we store SHA-256 hash
 * - Magic link bypasses password but NOT TOTP if enabled
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { generateToken, hashToken } from './tokens.js';

export const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export interface IssuedMagicLink {
  token: string;
  expiresAt: Date;
}

export async function issueMagicLink(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<IssuedMagicLink> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_LIFETIME_MS);
  await db.magicLink.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
}

export type MagicLinkRedeemResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

export async function redeemMagicLink(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<MagicLinkRedeemResult> {
  const tokenHash = hashToken(token);
  const row = await db.magicLink.findUnique({ where: { tokenHash } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  await db.magicLink.update({ where: { id: row.id }, data: { usedAt: now } });
  return { ok: true, userId: row.userId };
}
