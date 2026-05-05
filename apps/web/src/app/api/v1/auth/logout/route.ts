import type { NextRequest } from 'next/server';
import { invalidateSession } from '@/lib/auth/sessions';
import { prisma } from '@/lib/session';
import { corsPreflight, jsonCors } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = req.headers.get('authorization');
  const m = auth ? /^bearer\s+(.+)$/i.exec(auth.trim()) : null;
  const token = m?.[1];
  if (token) await invalidateSession(prisma(), token);
  return jsonCors(req, { ok: true });
}
