/**
 * Per-token rate limit for the MCP endpoint.
 *
 * 60 requests/min per token. Backed by Redis when available (single
 * counter per minute bucket); falls back to an in-memory map if Redis
 * is down so the route stays usable.
 *
 * `resetMcpRateLimitForTests` is exported only for test isolation — it
 * clears the in-memory map between test cases without touching Redis.
 */
import 'server-only';
import Redis from 'ioredis';

const WINDOW_SECONDS = 60;
const MAX_PER_WINDOW = 60;

declare global {
  var __ttMcpRateLimitRedis: Redis | undefined;
  var __ttMcpRateLimitMem: Map<string, { count: number; expires: number }> | undefined;
}

function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!globalThis.__ttMcpRateLimitRedis) {
    globalThis.__ttMcpRateLimitRedis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return globalThis.__ttMcpRateLimitRedis;
}

function memMap(): Map<string, { count: number; expires: number }> {
  if (!globalThis.__ttMcpRateLimitMem) globalThis.__ttMcpRateLimitMem = new Map();
  return globalThis.__ttMcpRateLimitMem;
}

export interface McpRateLimitResult {
  ok: true;
  remaining: number;
  resetIn: number;
}

export interface McpRateLimitExceeded {
  ok: false;
  resetIn: number;
}

export async function checkMcpRateLimit(
  tokenId: string,
): Promise<McpRateLimitResult | McpRateLimitExceeded> {
  const bucketKey = `ratelimit:mcp-token:${tokenId}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;
  const r = redis();
  if (r) {
    try {
      if (r.status !== 'ready' && r.status !== 'connecting') await r.connect();
      const count = await r.incr(bucketKey);
      if (count === 1) await r.expire(bucketKey, WINDOW_SECONDS);
      if (count > MAX_PER_WINDOW) {
        return { ok: false, resetIn: WINDOW_SECONDS };
      }
      return {
        ok: true,
        remaining: Math.max(0, MAX_PER_WINDOW - count),
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
    if (entry.count > MAX_PER_WINDOW) {
      return { ok: false, resetIn: Math.ceil((entry.expires - now) / 1000) };
    }
    return {
      ok: true,
      remaining: Math.max(0, MAX_PER_WINDOW - entry.count),
      resetIn: Math.ceil((entry.expires - now) / 1000),
    };
  }
  map.set(bucketKey, { count: 1, expires: now + WINDOW_SECONDS * 1000 });
  // Best-effort cleanup of expired entries to keep the map bounded.
  if (map.size > 1024) {
    for (const [k, v] of map) if (v.expires <= now) map.delete(k);
  }
  return { ok: true, remaining: MAX_PER_WINDOW - 1, resetIn: WINDOW_SECONDS };
}

/** For test isolation only. Clears the in-memory counter map. */
export function resetMcpRateLimitForTests(): void {
  globalThis.__ttMcpRateLimitMem = new Map();
}
