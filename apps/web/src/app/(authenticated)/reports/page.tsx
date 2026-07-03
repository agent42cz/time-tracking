import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { buildGroupedReport, parseGroupBy, runReport } from '@/lib/services/reports';
import { ReportFiltersForm } from './ReportFiltersForm';
import { ReportGrouped } from './ReportGrouped';
import { ExportDialog } from './ExportDialog';

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
  const [result, t] = await Promise.all([
    runReport(prisma(), s.userId, filters),
    getTranslations('reports'),
  ]);
  const report = buildGroupedReport(result.ok ? result.value : [], {
    groupBy,
    clampEnd: filters.to,
  });

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <ExportDialog
            isAdmin={isAdmin}
            meId={s.userId}
            members={members.map((m) => ({ id: m.userId, name: m.user.fullName }))}
            initial={{ from: sp.from ?? '', to: sp.to ?? '', memberIds: asArray(sp.member) }}
          />
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
