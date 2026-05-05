/**
 * Best-effort publisher to Redis pub/sub. Every mutation handler that
 * affects a TimeEntry calls `publishTimeEntry` so the WS service can
 * fan it out to the user's open clients (web tabs + extension popup).
 *
 * No throw on failure — the mutation already succeeded against Postgres,
 * we don't want to surface "couldn't notify your other tabs" as an error.
 * Skip entirely when REDIS_URL is unset (tests, isolated dev runs).
 */
import { Redis } from 'ioredis';

type TimeEntryEventType =
  | 'time_entry.created'
  | 'time_entry.updated'
  | 'time_entry.deleted'
  | 'time_entry.restored'
  | 'timer.started'
  | 'timer.stopped';

declare global {
  var __ttRealtimePublisher: Redis | undefined;
}

function publisher(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!globalThis.__ttRealtimePublisher) {
    globalThis.__ttRealtimePublisher = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return globalThis.__ttRealtimePublisher;
}

export async function publishTimeEntry(
  type: TimeEntryEventType,
  ctx: { userId: string; companyId: string; entryId: string },
): Promise<void> {
  const r = publisher();
  if (!r) return;
  const payload = JSON.stringify({
    type,
    payload: { entryId: ctx.entryId, companyId: ctx.companyId },
    emittedAt: new Date().toISOString(),
  });
  // Two channels: the user's private channel so all of *their* tabs/popups
  // see it, plus the company channel so admins watching the team get it too.
  const send = async (channel: string): Promise<void> => {
    try {
      if (r.status !== 'ready' && r.status !== 'connecting') await r.connect();
      await r.publish(channel, JSON.stringify({ ...JSON.parse(payload), channel }));
    } catch {
      // Swallow — the mutation itself already succeeded.
    }
  };
  await Promise.all([send(`user:${ctx.userId}`), send(`company:${ctx.companyId}`)]);
}
