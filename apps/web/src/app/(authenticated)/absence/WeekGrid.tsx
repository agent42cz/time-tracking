import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import type { WeekOverview } from '@/lib/services/absences';
import {
  ABSENCE_KIND_CLASSES,
  ABSENCE_KIND_LABELS,
  formatDayShort,
  isWeekendDay,
  weekdayLabelForDay,
} from './kinds';

/**
 * The Monday-morning answer to "kdo tu tento týden nebude". One row per
 * member with at least one absent day; empty days stay blank so the eye reads
 * the blocks, not the grid.
 */
export function WeekGrid({
  overview,
  weekStart,
  prevWeek,
  nextWeek,
  today,
  isCurrentWeek,
}: {
  overview: WeekOverview;
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  today: string;
  isCurrentWeek: boolean;
}): ReactElement {
  const title = isCurrentWeek ? 'Tento týden' : `Týden od ${formatDayShort(weekStart)}`;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={`/absence?week=${prevWeek}`}
            className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            ← Předchozí
          </Link>
          {!isCurrentWeek && (
            <Link
              href="/absence"
              className="rounded-md px-2 py-1 text-indigo-600 hover:bg-zinc-100 dark:text-indigo-400 dark:hover:bg-zinc-700"
            >
              Tento týden
            </Link>
          )}
          <Link
            href={`/absence?week=${nextWeek}`}
            className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Další →
          </Link>
        </div>
      </CardHeader>
      <CardBody>
        {overview.members.length === 0 ? (
          <EmptyState
            title="Tento týden jsou všichni k dispozici"
            description="Žádná nahlášená nepřítomnost."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th className="w-40 pb-1 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Člen
                  </th>
                  {overview.days.map((day) => (
                    <th
                      key={day}
                      className={
                        'pb-1 text-center text-xs font-medium ' +
                        (day === today
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : isWeekendDay(day)
                            ? 'text-zinc-400 dark:text-zinc-500'
                            : 'text-zinc-500 dark:text-zinc-400')
                      }
                    >
                      <span className="block">{weekdayLabelForDay(day)}</span>
                      <span className="block font-normal">{formatDayShort(day)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.members.map((member) => {
                  const byDay = new Map(member.days.map((d) => [d.day, d]));
                  return (
                    <tr key={member.userId}>
                      <td className="pr-2 text-zinc-900 dark:text-zinc-100">{member.userName}</td>
                      {overview.days.map((day) => {
                        const cell = byDay.get(day);
                        return (
                          <td key={day} className="px-0.5 text-center">
                            {cell ? (
                              <span
                                title={
                                  ABSENCE_KIND_LABELS[cell.kind] +
                                  (cell.note ? ` — ${cell.note}` : '')
                                }
                                className={
                                  'block truncate rounded px-1 py-1 text-[11px] font-medium ' +
                                  ABSENCE_KIND_CLASSES[cell.kind]
                                }
                              >
                                {ABSENCE_KIND_LABELS[cell.kind]}
                              </span>
                            ) : (
                              <span
                                className={
                                  'block rounded py-1 ' +
                                  (isWeekendDay(day) ? 'bg-zinc-50 dark:bg-zinc-800/60' : '')
                                }
                              >
                                &nbsp;
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
