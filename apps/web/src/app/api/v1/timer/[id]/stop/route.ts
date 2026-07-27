import type { NextRequest } from 'next/server';
import { resolveApiSession } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { stopTimer } from '@/lib/services/time-entries';
import { previewAutoStack } from '@/lib/services/auto-stack-save';
import { logTimerDiag } from '@/lib/diag-log';

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
  const result = await stopTimer(prisma(), session.userId, id);
  if (!result.ok) {
    logTimerDiag({
      actorUserId: session.userId,
      entryId: id,
      source: session.authSource,
      action: 'stop',
      outcome: result.reason === 'not_running' ? 'conflict' : 'error',
    });
    return errorCors(req, 404, result.reason);
  }
  logTimerDiag({
    actorUserId: session.userId,
    entryId: id,
    source: session.authSource,
    action: 'stop',
    outcome: 'ok',
  });

  let overlap: { entryId: string; startedAt: string; endedAt: string } | null = null;
  if (session.autoStackOverlaps) {
    const entry = await prisma().timeEntry.findFirst({
      where: { id, userId: session.userId, deletedAt: null },
      select: { companyId: true, startedAt: true, endedAt: true },
    });
    if (entry?.endedAt) {
      const probe = await previewAutoStack(prisma(), {
        actorUserId: session.userId,
        companyId: entry.companyId,
        candidate: { kind: 'edit', id, startedAt: entry.startedAt, endedAt: entry.endedAt },
        direction: 'forward',
        now: new Date(),
      });
      if (probe.ok) {
        const moved =
          probe.plan.shifts.length > 0 ||
          probe.plan.candidateAfter.startedAt.getTime() !== entry.startedAt.getTime() ||
          probe.plan.candidateAfter.endedAt.getTime() !== entry.endedAt.getTime();
        if (moved) {
          overlap = {
            entryId: id,
            startedAt: entry.startedAt.toISOString(),
            endedAt: entry.endedAt.toISOString(),
          };
        }
      }
    }
  }
  return jsonCors(req, { ok: true, overlap });
}
