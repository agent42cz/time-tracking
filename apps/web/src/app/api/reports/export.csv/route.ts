import type { NextRequest } from 'next/server';
import { parseInclusiveAppZoneRange } from '@tt/shared/time';
import { prisma, requireActiveCompany } from '@/lib/session';
import { rowsToCsv, runReport } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const s = await requireActiveCompany();
  const sp = req.nextUrl.searchParams;
  const { from, to } = parseInclusiveAppZoneRange(sp.get('from'), sp.get('to'));
  const result = await runReport(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    from,
    to,
    clientIds: sp.getAll('client'),
    projectIds: sp.getAll('project'),
    memberIds: sp.getAll('member'),
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
