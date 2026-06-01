import type { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { buildGroupedReport, parseGroupBy, runReport } from '@/lib/services/reports';
import { buildReportPdf, type ReportPdfStrings } from '@/lib/services/report-pdf';
import { getPreviousMonthRange, pad2, toAppZone } from '@tt/shared/time';

export const dynamic = 'force-dynamic';

function ymdPrague(d: Date): { y: number; m: number; day: number } {
  const z = toAppZone(d);
  return { y: z.getFullYear(), m: z.getMonth() + 1, day: z.getDate() };
}

function formatPragueDate(d: Date): string {
  const p = ymdPrague(d);
  return `${p.day}. ${p.m}. ${p.y}`;
}

function periodLabel(from: Date | undefined, to: Date | undefined, allLabel: string): string {
  if (!from && !to) return allLabel;
  const f = from ? formatPragueDate(from) : '…';
  // `to` is the exclusive end; show the last included day.
  const t = to ? formatPragueDate(new Date(to.getTime() - 1)) : '…';
  return `${f} – ${t}`;
}

function filename(from?: Date, to?: Date): string {
  if (from && to) {
    const a = ymdPrague(from);
    const lastDay = ymdPrague(new Date(to.getTime() - 1));
    // Whole calendar month → vykaz-YYYY-MM.pdf
    if (a.day === 1 && lastDay.y === a.y && lastDay.m === a.m && ymdPrague(to).day === 1) {
      return `vykaz-${a.y}-${pad2(a.m)}.pdf`;
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

  let from: Date | undefined;
  let to: Date | undefined;
  if (sp.get('preset') === 'lastMonth') {
    const r = getPreviousMonthRange();
    from = r.start;
    to = r.end;
  } else {
    from = sp.get('from') ? new Date(sp.get('from')!) : undefined;
    to = sp.get('to') ? new Date(sp.get('to')!) : undefined;
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

  const [t, company] = await Promise.all([
    getTranslations({ locale: 'cs', namespace: 'reports' }),
    prisma().company.findUnique({ where: { id: s.activeCompanyId }, select: { name: true } }),
  ]);
  const groupLabel = t(`groupBy.${groupBy}` as Parameters<typeof t>[0]);
  const strings: ReportPdfStrings = {
    date: t('pdf.date'),
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
    periodLabel: periodLabel(from, to, t('pdf.allPeriod')),
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
