import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { buildGroupedReport, runReport, type GroupBy } from '@/lib/services/reports';
import { ReportFiltersForm } from './ReportFiltersForm';
import { ReportGrouped } from './ReportGrouped';

interface SP {
  from?: string;
  to?: string;
  client?: string | string[];
  project?: string | string[];
  member?: string | string[];
  tag?: string | string[];
  tagsMode?: string;
  search?: string;
  groupBy?: string;
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseGroupBy(v: string | undefined): GroupBy {
  return v === 'member' || v === 'day' ? v : 'project';
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const sp = await searchParams;
  const isAdmin = s.activeRole === 'admin';

  const [autoStackUser, clients, projects, members, tags] = await Promise.all([
    prisma().user.findUniqueOrThrow({
      where: { id: s.userId },
      select: { autoStackOverlaps: true },
    }),
    prisma().client.findMany({
      where: { companyId: s.activeCompanyId },
      orderBy: { name: 'asc' },
    }),
    prisma().project.findMany({
      where: { client: { companyId: s.activeCompanyId } },
      include: { client: true },
      orderBy: { name: 'asc' },
    }),
    isAdmin
      ? prisma().membership.findMany({
          where: { companyId: s.activeCompanyId },
          include: { user: true },
          orderBy: { user: { fullName: 'asc' } },
        })
      : Promise.resolve([]),
    prisma().tag.findMany({
      where: { companyId: s.activeCompanyId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const filters = {
    companyId: s.activeCompanyId,
    from: sp.from ? new Date(sp.from) : undefined,
    to: sp.to ? new Date(sp.to) : undefined,
    clientIds: asArray(sp.client),
    projectIds: asArray(sp.project),
    memberIds: asArray(sp.member),
    tagIds: asArray(sp.tag),
    tagsMode: sp.tagsMode === 'and' ? ('and' as const) : ('or' as const),
    search: sp.search || undefined,
  };

  const groupBy = parseGroupBy(sp.groupBy);
  const result = await runReport(prisma(), s.userId, filters);
  const report = buildGroupedReport(result.ok ? result.value : [], {
    groupBy,
    clampEnd: filters.to,
  });
  const t = await getTranslations('reports');

  const exportQS = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => exportQS.append(k, x));
    else if (typeof v === 'string') exportQS.append(k, v);
  }
  if (!exportQS.get('groupBy')) exportQS.set('groupBy', groupBy);

  return (
    <div>
      <PageHeader
        title={t('title')}
        description="Seskupený přehled záznamů se součty a exportem."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/reports/export.pdf?preset=lastMonth&groupBy=project"
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('export.lastMonth')}
            </a>
            <a
              href={`/api/reports/export.csv?${exportQS.toString()}`}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('export.csv')}
            </a>
            <a
              href={`/api/reports/export.pdf?${exportQS.toString()}`}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
            >
              {t('export.pdf')}
            </a>
          </div>
        }
      />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('filters')}</CardTitle>
          </CardHeader>
          <CardBody>
            <ReportFiltersForm
              isAdmin={isAdmin}
              meId={s.userId}
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              projects={projects.map((p) => ({ id: p.id, name: `${p.client.name} → ${p.name}` }))}
              members={members.map((m) => ({ id: m.userId, name: m.user.fullName }))}
              tags={tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }))}
              initial={{
                from: sp.from ?? '',
                to: sp.to ?? '',
                clientIds: asArray(sp.client),
                projectIds: asArray(sp.project),
                memberIds: asArray(sp.member),
                tagIds: asArray(sp.tag),
                tagsMode: filters.tagsMode,
                search: sp.search ?? '',
                groupBy,
              }}
            />
          </CardBody>
        </Card>

        <ReportGrouped
          report={report}
          autoStackOverlaps={autoStackUser.autoStackOverlaps}
          labels={{ grandTotal: t('grandTotal'), subtotal: t('subtotal') }}
        />
      </div>
    </div>
  );
}
