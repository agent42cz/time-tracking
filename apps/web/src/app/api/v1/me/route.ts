import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  return jsonCors(req, {
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    totpEnabled: session.totpEnabled,
    memberships: session.memberships,
    wsUrl: process.env.WS_PUBLIC_URL ?? null,
  });
}
