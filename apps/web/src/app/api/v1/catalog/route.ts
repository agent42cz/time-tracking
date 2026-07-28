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
  // `tags: []` is a compatibility shim, not a feature. AIAGE-57 removed tags, but the
  // extension ships through the Chrome Web Store, so installed copies (<=1.6.1) still
  // do `catalog.tags.length` and crash on an absent key. Serving an empty array keeps
  // them working — their tag UI renders nothing — until enough users have updated.
  // Remove once 1.6.2+ adoption is high enough. See ADR-0015.
  if (!active) return jsonCors(req, { companyId: null, clients: [], tags: [] });

  const clients = await prisma().client.findMany({
    where: { companyId: active.companyId, archived: false },
    include: {
      projects: {
        where: { archived: false },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return jsonCors(req, {
    companyId: active.companyId,
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
    })),
    tags: [], // compatibility shim — see the comment above
  });
}
