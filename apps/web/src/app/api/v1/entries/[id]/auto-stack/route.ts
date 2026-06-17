import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { saveEntryWithAutoStack } from '@/lib/services/auto-stack-save';
import { parseAutoStackRequest, planToWire } from '@/lib/api/auto-stack-route-helpers';

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
  const parsed = await parseAutoStackRequest(req, session, id);
  if (!parsed.ok) return parsed.response;
  const { candidate, companyId, direction, manualStartedAt } = parsed.value;

  const result = await saveEntryWithAutoStack(prisma(), {
    actorUserId: session.userId,
    companyId,
    candidate,
    direction,
    manualStartedAt,
    now: new Date(),
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return errorCors(req, 404, 'not_found');
    return errorCors(req, 422, result.reason);
  }
  return jsonCors(req, { ok: true, plan: planToWire(result.plan) });
}
