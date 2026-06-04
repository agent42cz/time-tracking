/** POST /api/v1/entries → create a manual (completed) time entry in the active company. */
import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { createManualEntry } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return errorCors(req, 404, 'no_company');

  let body: {
    description?: string;
    note?: string;
    clientId?: string | null;
    projectId?: string | null;
    startedAt?: string;
    endedAt?: string;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  if (!body.startedAt || !body.endedAt) return errorCors(req, 400, 'missing_window');
  const startedAt = new Date(body.startedAt);
  const endedAt = new Date(body.endedAt);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return errorCors(req, 400, 'invalid_date');
  }

  const result = await createManualEntry(prisma(), session.userId, {
    companyId: active.companyId,
    description: body.description ?? '',
    note: body.note ?? '',
    clientId: body.clientId ?? null,
    projectId: body.projectId ?? null,
    startedAt,
    endedAt,
    tagIds: body.tagIds ?? [],
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { id: result.value.id });
}
