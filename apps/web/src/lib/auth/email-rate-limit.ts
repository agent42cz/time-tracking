/**
 * Rate limit for outbound auth emails — password reset and magic link
 * (AIAGE-39). Sliding window per target email AND per source IP, counted
 * across both kinds so alternating reset/magic-link doesn't double the
 * budget. Callers record every request (even for unknown emails) so the
 * limiter can't be probed around, and the block message stays identical for
 * existing and nonexistent accounts (no enumeration oracle).
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export const EMAIL_SEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_SENDS_PER_EMAIL = 5;
export const MAX_SENDS_PER_IP = 5;

type Db = PrismaClient | Prisma.TransactionClient;

export type EmailSendKind = 'password_reset' | 'magic_link';

export async function recordEmailSend(
  db: Db,
  attempt: { kind: EmailSendKind; email: string; ip?: string | null },
  now: Date = new Date(),
): Promise<void> {
  await db.emailSendAttempt.create({
    data: {
      kind: attempt.kind,
      email: attempt.email.toLowerCase(),
      ip: attempt.ip ?? null,
      createdAt: now,
    },
  });
}

export async function checkEmailSendAllowed(
  db: Db,
  source: { email: string; ip?: string | null },
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const since = new Date(now.getTime() - EMAIL_SEND_WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.emailSendAttempt.count({
      where: { email: source.email.toLowerCase(), createdAt: { gte: since } },
    }),
    source.ip
      ? db.emailSendAttempt.count({ where: { ip: source.ip, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);
  return { allowed: byEmail < MAX_SENDS_PER_EMAIL && byIp < MAX_SENDS_PER_IP };
}
