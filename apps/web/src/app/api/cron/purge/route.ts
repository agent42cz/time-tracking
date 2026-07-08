import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/session';
import { purgeOldDeleted } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

const BEARER = 'Bearer ';

/**
 * 401 rather than 404: the constitution's "404 never 403" rule exists to
 * prevent cross-company existence leaks. This endpoint serves no company-scoped
 * data. See ADR-0011.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith(BEARER)) return false;
  const provided = Buffer.from(header.slice(BEARER.length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await purgeOldDeleted(prisma());
  return Response.json(result);
}
