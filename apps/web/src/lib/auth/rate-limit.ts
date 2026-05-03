/**
 * Password attempt rate limit (PRD §4 implied; BUILD-PROMPT Phase 2.5).
 *
 * Tracks attempts per email in a sliding window. After
 * MAX_FAILURES failures inside WINDOW_MS, the account is locked for
 * LOCKOUT_MS. A successful attempt clears the window.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000; // 15 min
export const LOCKOUT_MS = 30 * 60 * 1000; // 30 min

type Db = PrismaClient | Prisma.TransactionClient;

export interface LockoutStatus {
  locked: boolean;
  unlocksAt: Date | null;
  failureCount: number;
}

export async function recordAttempt(
  db: Db,
  email: string,
  success: boolean,
  meta: { userId?: string | null; ip?: string | null } = {},
  now: Date = new Date(),
): Promise<void> {
  await db.passwordLoginAttempt.create({
    data: {
      email: email.toLowerCase(),
      success,
      userId: meta.userId ?? null,
      ip: meta.ip ?? null,
      createdAt: now,
    },
  });
}

export async function getLockoutStatus(
  db: Db,
  email: string,
  now: Date = new Date(),
): Promise<LockoutStatus> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const attempts = await db.passwordLoginAttempt.findMany({
    where: { email: email.toLowerCase(), createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });
  // A success since the last lockout window resets the counter.
  const failuresSinceLastSuccess: typeof attempts = [];
  for (const a of attempts) {
    if (a.success) break;
    failuresSinceLastSuccess.push(a);
  }
  const count = failuresSinceLastSuccess.length;
  if (count < MAX_FAILURES) {
    return { locked: false, unlocksAt: null, failureCount: count };
  }
  const lastFailure = failuresSinceLastSuccess[0];
  const unlocksAt = lastFailure ? new Date(lastFailure.createdAt.getTime() + LOCKOUT_MS) : null;
  if (!unlocksAt || unlocksAt.getTime() <= now.getTime()) {
    return { locked: false, unlocksAt: null, failureCount: count };
  }
  return { locked: true, unlocksAt, failureCount: count };
}
