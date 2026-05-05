/**
 * Per-IP rate limit for the login endpoint, on top of the per-email lockout
 * already enforced by `auth/rate-limit.ts` (5 failures / 15 min → 30-min
 * account lockout). This caps how fast an attacker can iterate across many
 * email addresses from a single IP, which the per-email check does not.
 *
 * Backed by Redis when available (single counter per minute bucket); falls
 * back to an in-memory map if Redis is down so the route stays usable.
 */
import 'server-only';
import Redis from 'ioredis';

const WINDOW_SECONDS = 60;
const MAX_PER_MINUTE = 30;

declare global {
  var __ttRateLimitRedis: Redis | undefined;
  var __ttRateLimitMem: Map<string, { count: number; expires: number }> | undefined;
}

function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!globalThis.__ttRateLimitRedis) {
    globalThis.__ttRateLimitRedis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return globalThis.__ttRateLimitRedis;
}

function memMap(): Map<string, { count: number; expires: number }> {
  if (!globalThis.__ttRateLimitMem) globalThis.__ttRateLimitMem = new Map();
  return globalThis.__ttRateLimitMem;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetIn: number;
}

export async function checkIpRateLimit(ip: string | null): Promise<RateLimitResult> {
  if (!ip) return { ok: true, remaining: MAX_PER_MINUTE, resetIn: WINDOW_SECONDS };
  const bucketKey = `ratelimit:login-ip:${ip}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;
  const r = redis();
  if (r) {
    try {
      if (r.status !== 'ready' && r.status !== 'connecting') await r.connect();
      const count = await r.incr(bucketKey);
      if (count === 1) await r.expire(bucketKey, WINDOW_SECONDS);
      return {
        ok: count <= MAX_PER_MINUTE,
        remaining: Math.max(0, MAX_PER_MINUTE - count),
        resetIn: WINDOW_SECONDS,
      };
    } catch {
      // Fall through to in-memory.
    }
  }
  const map = memMap();
  const now = Date.now();
  const entry = map.get(bucketKey);
  if (entry && entry.expires > now) {
    entry.count += 1;
    return {
      ok: entry.count <= MAX_PER_MINUTE,
      remaining: Math.max(0, MAX_PER_MINUTE - entry.count),
      resetIn: Math.ceil((entry.expires - now) / 1000),
    };
  }
  map.set(bucketKey, { count: 1, expires: now + WINDOW_SECONDS * 1000 });
  // Best-effort cleanup of expired entries to keep the map bounded.
  if (map.size > 1024) {
    for (const [k, v] of map) if (v.expires <= now) map.delete(k);
  }
  return { ok: true, remaining: MAX_PER_MINUTE - 1, resetIn: WINDOW_SECONDS };
}
