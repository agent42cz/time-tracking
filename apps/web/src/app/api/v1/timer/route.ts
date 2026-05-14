/**
 * GET  /api/v1/timer
 *   → running timers (`running`)
 *   → today's completed entries (`today`) — drives the web /timer page
 *   → last 5 completed entries regardless of day (`recent`) — drives the
 *     extension popup's "Nedávno" list
 * POST /api/v1/timer  → start a timer in the active company
 *
 * Active company is the one in the `tt-company` query param if present,
 * otherwise the user's first membership. Outsiders / non-members are
 * implicitly filtered by the service layer's company-id check.
 */
import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { prisma } from '@/lib/session';
import { startTimer } from '@/lib/services/time-entries';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return jsonCors(req, { companyId: null, running: [], today: [], recent: [] });

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [running, today, recent] = await Promise.all([
    prisma().timeEntry.findMany({
      where: {
        userId: session.userId,
        companyId: active.companyId,
        endedAt: null,
        deletedAt: null,
      },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma().timeEntry.findMany({
      where: {
        userId: session.userId,
        companyId: active.companyId,
        deletedAt: null,
        endedAt: { not: null },
        startedAt: { gte: dayStart, lt: dayEnd },
      },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma().timeEntry.findMany({
      where: {
        userId: session.userId,
        companyId: active.companyId,
        deletedAt: null,
        endedAt: { not: null },
      },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);

  function dto(e: (typeof running)[number]): unknown {
    return {
      id: e.id,
      description: e.description,
      clientId: e.clientId,
      clientName: e.client?.name ?? null,
      projectId: e.projectId,
      projectName: e.project?.name ?? null,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      tags: e.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    };
  }
  return jsonCors(req, {
    companyId: active.companyId,
    running: running.map(dto),
    today: today.map(dto),
    recent: recent.map(dto),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await resolveApiSession(req);
  if (!session) return errorCors(req, 401, 'unauthorized');
  const preferred = req.nextUrl.searchParams.get('company');
  const active = pickActiveCompany(session, preferred);
  if (!active) return errorCors(req, 404, 'no_company');
  let body: {
    description?: string;
    clientId?: string | null;
    projectId?: string | null;
    tagIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  const result = await startTimer(prisma(), session.userId, {
    companyId: active.companyId,
    description: body.description ?? '',
    clientId: body.clientId ?? null,
    projectId: body.projectId ?? null,
    tagIds: body.tagIds ?? [],
  });
  if (!result.ok) return errorCors(req, 400, 'cannot_start');
  return jsonCors(req, { id: result.value.id });
}
