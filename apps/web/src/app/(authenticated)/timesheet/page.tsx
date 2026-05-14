import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { getPeriodRange } from '@tt/shared/time';
import { PageHeader } from '@/components/PageHeader';
import { listMyWeek } from '@/lib/services/time-entries';
import { TimesheetEntryRow } from './TimesheetEntryRow';

function ymd(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const { week } = await searchParams;
  const ref = week ? new Date(week) : new Date();
  const range = getPeriodRange('week', ref);

  const result = await listMyWeek(prisma(), s.userId, s.activeCompanyId, range);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Výkaz" />
        <EmptyState title="Nepodařilo se načíst data" />
      </div>
    );
  }

  const entriesById = await prisma().timeEntry.findMany({
    where: { id: { in: result.value.map((e) => e.id) } },
    include: { client: true, project: true, tags: { include: { tag: true } } },
  });
  const enriched = new Map(entriesById.map((e) => [e.id, e]));

  const days = new Map<string, { date: Date; entries: typeof entriesById }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    days.set(dayKey(d), { date: d, entries: [] });
  }
  for (const e of result.value) {
    const k = dayKey(e.startedAt);
    const day = days.get(k);
    const full = enriched.get(e.id);
    if (day && full) day.entries.push(full);
  }

  const total = result.value.reduce(
    (acc, e) => acc + ((e.endedAt?.getTime() ?? 0) - e.startedAt.getTime()),
    0,
  );

  const prev = new Date(range.start);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(range.end);

  return (
    <div>
      <PageHeader
        title="Výkaz"
        description={`${ymd(range.start)} – ${ymd(new Date(range.end.getTime() - 1))}`}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link
              className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              href={`/timesheet?week=${prev.toISOString()}`}
            >
              ← Předchozí
            </Link>
            <Link
              className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              href="/timesheet"
            >
              Tento týden
            </Link>
            <Link
              className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              href={`/timesheet?week=${next.toISOString()}`}
            >
              Následující →
            </Link>
            <span className="ml-3 font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {fmtDur(total)}
            </span>
          </div>
        }
      />
      <div className="space-y-4">
        {Array.from(days.values()).map(({ date, entries }) => {
          const dayTotal = entries.reduce(
            (acc, e) => acc + ((e.endedAt?.getTime() ?? 0) - e.startedAt.getTime()),
            0,
          );
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <Card key={dayKey(date)}>
              <CardHeader>
                <CardTitle>
                  <span className={isWeekend ? 'text-zinc-500 dark:text-zinc-400' : ''}>
                    {date.toLocaleDateString('cs-CZ', { weekday: 'long' })} {ymd(date)}
                  </span>
                </CardTitle>
                <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                  {fmtDur(dayTotal)}
                </span>
              </CardHeader>
              <CardBody>
                {entries.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">Žádné záznamy</p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                    {entries.map((e) => (
                      <TimesheetEntryRow
                        key={e.id}
                        entryId={e.id}
                        startedAt={e.startedAt.toISOString()}
                        endedAt={e.endedAt ? e.endedAt.toISOString() : null}
                        description={e.description ?? ''}
                        clientName={e.client?.name ?? null}
                        projectName={e.project?.name ?? null}
                        startLabel={fmtTime(e.startedAt)}
                        endLabel={e.endedAt ? fmtTime(e.endedAt) : '...'}
                        durationLabel={fmtDur(
                          (e.endedAt?.getTime() ?? Date.now()) - e.startedAt.getTime(),
                        )}
                        tags={e.tags.map((tt) => ({
                          id: tt.tagId,
                          name: tt.tag.name,
                          color: tt.tag.color,
                        }))}
                      />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
