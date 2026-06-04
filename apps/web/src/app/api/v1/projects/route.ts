/** POST /api/v1/projects → create a project under an existing client (admin-only). */
import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { createProject } from '@/lib/services/catalog';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  let body: { clientId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  const clientId = body.clientId?.trim();
  const name = body.name?.trim();
  if (!clientId || !name) return errorCors(req, 400, 'invalid');
  const result = await createProject(prisma(), session.userId, { clientId, name });
  if (!result.ok) return errorCors(req, 404, result.reason);
  return jsonCors(req, { id: result.value.id });
}
