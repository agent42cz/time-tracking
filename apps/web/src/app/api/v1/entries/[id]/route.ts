import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { softDeleteEntry, updateEntry, type UpdateEntryPatch } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  let body: {
    description?: string;
    clientId?: string | null;
    projectId?: string | null;
    startedAt?: string;
    endedAt?: string | null;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }

  const patch: UpdateEntryPatch = {};
  if (body.description !== undefined) patch.description = body.description;
  if (body.clientId !== undefined) patch.clientId = body.clientId;
  if (body.projectId !== undefined) patch.projectId = body.projectId;
  if (body.tagIds !== undefined) patch.tagIds = body.tagIds;
  if (body.startedAt !== undefined) {
    const d = new Date(body.startedAt);
    if (Number.isNaN(d.getTime())) return errorCors(req, 400, 'invalid_date');
    patch.startedAt = d;
  }
  if (body.endedAt !== undefined) {
    if (body.endedAt === null) {
      patch.endedAt = null;
    } else {
      const d = new Date(body.endedAt);
      if (Number.isNaN(d.getTime())) return errorCors(req, 400, 'invalid_date');
      patch.endedAt = d;
    }
  }

  const result = await updateEntry(prisma(), session.userId, id, patch);
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const result = await softDeleteEntry(prisma(), session.userId, id);
  if (!result.ok) return errorCors(req, 404, result.reason);
  return jsonCors(req, { ok: true });
}
