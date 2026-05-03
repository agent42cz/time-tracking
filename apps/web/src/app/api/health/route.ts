/**
 * Healthcheck endpoint per BUILD-PROMPT Phase 10.
 * Returns 200 with `{ db, redis }` status. Used by Coolify and Beszel.
 */
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

let _prisma: PrismaClient | undefined;
let _redis: Redis | undefined;

function db(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

function redis(): Redis {
  if (!_redis) _redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  return _redis;
}

export async function GET(): Promise<Response> {
  const out: { db: 'ok' | 'down'; redis: 'ok' | 'down' } = { db: 'down', redis: 'down' };
  try {
    await db().$queryRaw`SELECT 1`;
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
