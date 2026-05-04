/**
 * Healthcheck endpoint per BUILD-PROMPT Phase 10.
 * Returns 200 with `{ db, redis }` status. Used by Coolify and Beszel.
 */
import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { prisma } from '@/lib/session';

declare global {
  var __ttHealthRedis: Redis | undefined;
}

function redis(): Redis {
  if (!globalThis.__ttHealthRedis) {
    globalThis.__ttHealthRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }
  return globalThis.__ttHealthRedis;
}

export async function GET(): Promise<Response> {
  const out: { db: 'ok' | 'down'; redis: 'ok' | 'down' } = { db: 'down', redis: 'down' };
  try {
    await prisma().$queryRaw`SELECT 1`;
    out.db = 'ok';
  } catch {
    /* leave as down */
  }
  try {
    const r = redis();
    if (r.status !== 'ready' && r.status !== 'connecting') await r.connect();
    const pong = await r.ping();
    if (pong === 'PONG') out.redis = 'ok';
  } catch {
    /* leave as down */
  }
  const allOk = out.db === 'ok' && out.redis === 'ok';
  return NextResponse.json(out, { status: allOk ? 200 : 503 });
}

export const dynamic = 'force-dynamic';
