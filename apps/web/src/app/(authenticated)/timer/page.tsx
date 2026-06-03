import type { ReactElement } from 'react';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { TimerStartCard } from './TimerStartCard';
import { TimerLists } from './TimerLists';
import { listRecentHistory } from '@/lib/services/time-entries';

export default async function TimerPage(): Promise<ReactElement> {
  const s = await requireActiveCompany();

  const now = new Date();
  const [autoStackUser, running, historyResult, clients, tags] = await Promise.all([
    prisma().user.findUniqueOrThrow({
      where: { id: s.userId },
      select: { autoStackOverlaps: true },
    }),
    prisma().timeEntry.findMany({
      where: { userId: s.userId, companyId: s.activeCompanyId, endedAt: null, deletedAt: null },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    listRecentHistory(prisma(), s.userId, s.activeCompanyId, now),
    prisma().client.findMany({
      where: { companyId: s.activeCompanyId, archived: false },
      include: {
        projects: { where: { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma().tag.findMany({ where: { companyId: s.activeCompanyId }, orderBy: { name: 'asc' } }),
  ]);
  const history = historyResult.ok ? historyResult.value : [];

  return (
    <div>
      <PageHeader
        title="Stopky"
        description="Spusťte měření jedním kliknutím. Více měření může běžet paralelně."
      />
      <div className="space-y-4 md:space-y-6">
        <TimerStartCard
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
          }))}
          tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          autoStackOverlaps={autoStackUser.autoStackOverlaps}
        />
        <TimerLists
          autoStackOverlaps={autoStackUser.autoStackOverlaps}
          initialNowMs={now.getTime()}
          initialRunning={running.map((r) => ({
            id: r.id,
            description: r.description,
            clientName: r.client?.name ?? null,
            projectName: r.project?.name ?? null,
            startedAt: r.startedAt.toISOString(),
            tags: r.tags.map((tt) => ({ name: tt.tag.name, color: tt.tag.color })),
          }))}
          initialHistory={history.map((e) => ({
            id: e.id,
            description: e.description,
            clientName: e.clientName,
            projectName: e.projectName,
            startedAt: e.startedAt.toISOString(),
            endedAt: e.endedAt!.toISOString(),
            tags: e.tags.map((tt) => ({ name: tt.name, color: tt.color })),
          }))}
        />
      </div>
    </div>
  );
}
