import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { startTimer } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const { id } = await params;
  const original = await prisma().timeEntry.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!original) return errorCors(req, 404, 'not_found');
  // Only the owner can replay; cross-company is implicitly blocked because
  // the user-id check below covers it (entries belong to a single user).
  if (original.userId !== session.userId) return errorCors(req, 404, 'not_found');
  const active = pickActiveCompany(session, original.companyId);
  if (!active || active.companyId !== original.companyId) return errorCors(req, 404, 'not_found');
  const result = await startTimer(prisma(), session.userId, {
    companyId: original.companyId,
    description: original.description,
    clientId: original.clientId,
    projectId: original.projectId,
    tagIds: original.tags.map((t) => t.tagId),
  });
  if (!result.ok) return errorCors(req, 400, 'cannot_start');
  return jsonCors(req, { id: result.value.id });
}
