import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireActiveCompany } from '@/lib/session';
import { getPeriodRange } from '@tt/shared/time';
import { PageHeader } from '@/components/PageHeader';
import { listMyWeek } from '@/lib/services/time-entries';

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
              className="rounded border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50"
              href={`/timesheet?week=${prev.toISOString()}`}
            >
              ← Předchozí
            </Link>
            <Link
              className="rounded border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50"
              href="/timesheet"
            >
              Tento týden
            </Link>
            <Link
              className="rounded border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50"
              href={`/timesheet?week=${next.toISOString()}`}
            >
              Následující →
            </Link>
            <span className="ml-3 font-mono text-base font-semibold text-zinc-900">
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
                  <span className={isWeekend ? 'text-zinc-500' : ''}>
                    {date.toLocaleDateString('cs-CZ', { weekday: 'long' })}{' '}
                    {ymd(date)}
                  </span>
                </CardTitle>
                <span className="font-mono text-sm text-zinc-700">{fmtDur(dayTotal)}</span>
              </CardHeader>
              <CardBody>
                {entries.length === 0 ? (
                  <p className="text-sm text-zinc-400">Žádné záznamy</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {entries.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-4 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">
                            {e.description || (
                              <span className="text-zinc-400">(bez popisu)</span>
                            )}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                            {e.client?.name ? <span>{e.client.name}</span> : null}
                            {e.project?.name ? <span>· {e.project.name}</span> : null}
                            {e.tags.map((tt) => (
                              <span
                                key={tt.tagId}
                                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                                style={{ backgroundColor: tt.tag.color }}
                              >
                                {tt.tag.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-zinc-600">
                          <span className="font-mono tabular-nums">
                            {fmtTime(e.startedAt)}–{e.endedAt ? fmtTime(e.endedAt) : '...'}
                          </span>
                          <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                            {fmtDur((e.endedAt?.getTime() ?? Date.now()) - e.startedAt.getTime())}
                          </span>
                        </div>
                      </li>
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
