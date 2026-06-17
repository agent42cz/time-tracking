import type { NextRequest } from 'next/server';
import { isThemePreference, resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';

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
    theme: session.theme,
    autoStackOverlaps: session.autoStackOverlaps,
    memberships: session.memberships,
    wsUrl: process.env.WS_PUBLIC_URL ?? null,
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  let body: { theme?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  if (!isThemePreference(body.theme)) return errorCors(req, 400, 'invalid_theme');
  await prisma().user.update({ where: { id: session.userId }, data: { theme: body.theme } });
  return jsonCors(req, { theme: body.theme });
}
