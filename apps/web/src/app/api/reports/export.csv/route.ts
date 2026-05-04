import type { NextRequest } from 'next/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { rowsToCsv, runReport } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const s = await requireActiveCompany();
  const sp = req.nextUrl.searchParams;
  const result = await runReport(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    from: sp.get('from') ? new Date(sp.get('from')!) : undefined,
    to: sp.get('to') ? new Date(sp.get('to')!) : undefined,
    clientIds: sp.getAll('client'),
    projectIds: sp.getAll('project'),
    memberIds: sp.getAll('member'),
    tagIds: sp.getAll('tag'),
    tagsMode: sp.get('tagsMode') === 'and' ? 'and' : 'or',
    search: sp.get('search') ?? undefined,
  });
  if (!result.ok) {
    return new Response('not found', { status: 404 });
  }
  const csv = rowsToCsv(result.value);
  const filename = `time-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
