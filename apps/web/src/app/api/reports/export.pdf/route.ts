import type { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { buildGroupedReport, runReport, type GroupBy } from '@/lib/services/reports';
import { buildReportPdf, type ReportPdfStrings } from '@/lib/services/report-pdf';
import { getPreviousMonthRange, toAppZone } from '@tt/shared/time';

export const dynamic = 'force-dynamic';

function parseGroupBy(v: string | null): GroupBy {
  return v === 'member' || v === 'day' ? v : 'project';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
function ymdPrague(d: Date): { y: number; m: number; day: number } {
  const z = toAppZone(d);
  return { y: z.getFullYear(), m: z.getMonth() + 1, day: z.getDate() };
}

function periodLabel(from?: Date, to?: Date): string {
  if (!from && !to) return 'Vše';
  const f = from ? ((p) => `${p.day}. ${p.m}. ${p.y}`)(ymdPrague(from)) : '…';
  // `to` is the exclusive end; show the last included day.
  const t = to ? ((p) => `${p.day}. ${p.m}. ${p.y}`)(ymdPrague(new Date(to.getTime() - 1))) : '…';
  return `${f} – ${t}`;
}

function filename(from?: Date, to?: Date): string {
  if (from && to) {
    const a = ymdPrague(from);
    const lastDay = ymdPrague(new Date(to.getTime() - 1));
    // Whole calendar month → vykaz-YYYY-MM.pdf
    if (a.day === 1 && lastDay.y === a.y && lastDay.m === a.m) {
      const next = ymdPrague(to);
      const wholeMonth = next.day === 1 && (next.m === a.m + 1 || (a.m === 12 && next.m === 1));
      if (wholeMonth) return `vykaz-${a.y}-${pad2(a.m)}.pdf`;
    }
    return `vykaz-${a.y}-${pad2(a.m)}-${pad2(a.day)}_${lastDay.y}-${pad2(lastDay.m)}-${pad2(lastDay.day)}.pdf`;
  }
  const today = ymdPrague(new Date());
  return `vykaz-${today.y}-${pad2(today.m)}-${pad2(today.day)}.pdf`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const s = await requireActiveCompany();
  const sp = req.nextUrl.searchParams;
  const groupBy = parseGroupBy(sp.get('groupBy'));

  let from = sp.get('from') ? new Date(sp.get('from')!) : undefined;
  let to = sp.get('to') ? new Date(sp.get('to')!) : undefined;
  if (sp.get('preset') === 'lastMonth') {
    const r = getPreviousMonthRange();
    from = r.start;
    to = r.end;
  }

  const result = await runReport(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    from,
    to,
    clientIds: sp.getAll('client'),
    projectIds: sp.getAll('project'),
    memberIds: sp.getAll('member'),
    tagIds: sp.getAll('tag'),
    tagsMode: sp.get('tagsMode') === 'and' ? 'and' : 'or',
    search: sp.get('search') ?? undefined,
  });
  if (!result.ok) return new Response('not found', { status: 404 });

  const report = buildGroupedReport(result.value, { groupBy, clampEnd: to });

  const t = await getTranslations({ locale: 'cs', namespace: 'reports' });
  const company = await prisma().company.findUnique({
    where: { id: s.activeCompanyId },
    select: { name: true },
  });
  const groupLabel =
    groupBy === 'member'
      ? t('groupBy.member')
      : groupBy === 'day'
        ? t('groupBy.day')
        : t('groupBy.project');
  const strings: ReportPdfStrings = {
    user: t('pdf.user'),
    description: t('pdf.description'),
    tags: t('pdf.tags'),
    duration: t('pdf.duration'),
    subtotal: t('pdf.subtotal'),
    grandTotal: t('pdf.grandTotal'),
    generatedAt: t('pdf.generatedAt'),
    groupedBy: t('pdf.groupedBy'),
    noEntries: t('pdf.noEntries'),
    groupLabel,
  };

  const pdf = await buildReportPdf(report, {
    companyName: company?.name ?? '',
    title: t('pdf.title'),
    periodLabel: periodLabel(from, to),
    generatedAt: new Date(),
    groupBy,
    t: strings,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename(from, to)}"`,
    },
  });
}
