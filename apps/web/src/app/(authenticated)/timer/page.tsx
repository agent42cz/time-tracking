import type { ReactElement } from 'react';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { TimerStartCard } from './TimerStartCard';
import { RunningTimers } from './RunningTimers';
import { TodayList } from './TodayList';

export default async function TimerPage(): Promise<ReactElement> {
  const s = await requireActiveCompany();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [running, today, clients, tags] = await Promise.all([
    prisma().timeEntry.findMany({
      where: {
        userId: s.userId,
        companyId: s.activeCompanyId,
        endedAt: null,
        deletedAt: null,
      },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma().timeEntry.findMany({
      where: {
        userId: s.userId,
        companyId: s.activeCompanyId,
        deletedAt: null,
        endedAt: { not: null },
        startedAt: { gte: dayStart, lt: dayEnd },
      },
      include: { client: true, project: true, tags: { include: { tag: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma().client.findMany({
      where: { companyId: s.activeCompanyId, archived: false },
      include: { projects: { where: { archived: false }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
    prisma().tag.findMany({
      where: { companyId: s.activeCompanyId },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Stopky"
        description="Spusťte měření jedním kliknutím. Více měření může běžet paralelně."
      />
      <div className="space-y-6">
        <TimerStartCard
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
          }))}
          tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        />
        {running.length > 0 ? (
          <RunningTimers
            entries={running.map((r) => ({
              id: r.id,
              description: r.description,
              clientName: r.client?.name ?? null,
              projectName: r.project?.name ?? null,
              startedAt: r.startedAt.toISOString(),
              tags: r.tags.map((tt) => ({ name: tt.tag.name, color: tt.tag.color })),
            }))}
          />
        ) : null}
        <TodayList
          entries={today.map((r) => ({
            id: r.id,
            description: r.description,
            clientName: r.client?.name ?? null,
            projectName: r.project?.name ?? null,
            startedAt: r.startedAt.toISOString(),
            endedAt: r.endedAt!.toISOString(),
            tags: r.tags.map((tt) => ({ name: tt.tag.name, color: tt.tag.color })),
          }))}
        />
      </div>
    </div>
  );
}
