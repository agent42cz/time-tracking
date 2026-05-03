/**
 * Server-side sessions with sliding renewal (PRD §4.2).
 *
 * Lifetime: 30 days, sliding. Renewal: when expiry < SLIDING_THRESHOLD_MS,
 * extend by SLIDING_LIFETIME_MS. Logout invalidates server-side.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { generateToken, hashToken } from './tokens.js';

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SLIDING_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // renew when <7 days left

type Db = PrismaClient | Prisma.TransactionClient;

export interface CreatedSession {
  id: string;
  token: string; // plaintext — return once to caller, set as cookie
  expiresAt: Date;
}

export async function createSession(db: Db, userId: string, now: Date = new Date()): Promise<CreatedSession> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  const session = await db.session.create({
    data: { sessionToken: tokenHash, userId, expires: expiresAt },
  });
  return { id: session.id, token, expiresAt };
}

export interface ResolvedSession {
  userId: string;
  expiresAt: Date;
  renewed: boolean;
}

export async function resolveSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({ where: { sessionToken: tokenHash } });
  if (!session) return null;
  if (session.expires.getTime() <= now.getTime()) return null;

  const remaining = session.expires.getTime() - now.getTime();
  if (remaining < SLIDING_THRESHOLD_MS) {
    const newExpiry = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await db.session.update({ where: { id: session.id }, data: { expires: newExpiry } });
    return { userId: session.userId, expiresAt: newExpiry, renewed: true };
  }
  return { userId: session.userId, expiresAt: session.expires, renewed: false };
}

export async function invalidateSession(db: Db, token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const result = await db.session.deleteMany({ where: { sessionToken: tokenHash } });
  return result.count > 0;
}

export async function invalidateAllSessions(db: Db, userId: string): Promise<number> {
  const result = await db.session.deleteMany({ where: { userId } });
  return result.count;
}
