import type { NextRequest } from 'next/server';
import { resolveApiSession, pickActiveCompany } from '@/lib/api/auth';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
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
  if (!active) return jsonCors(req, { companyId: null, clients: [], tags: [] });

  const [clients, tags] = await Promise.all([
    prisma().client.findMany({
      where: { companyId: active.companyId, archived: false },
      include: {
        projects: {
          where: { archived: false },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma().tag.findMany({
      where: { companyId: active.companyId },
      orderBy: { name: 'asc' },
    }),
  ]);

  return jsonCors(req, {
    companyId: active.companyId,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
  });
}
