/** GET /api/v1/dashboard/funds → admin-only client work-fund progress (AIAGE-52). */
import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { clientFundProgress } from '@/lib/services/dashboard';
import { prisma } from '@/lib/session';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return errorCors(req, 404, 'not_found');

  const r = await clientFundProgress(prisma(), session.userId, active.companyId);
  if (!r.ok) return errorCors(req, 404, 'not_found');
  return jsonCors(req, r.value);
}
