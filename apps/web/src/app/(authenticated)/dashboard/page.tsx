import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { getPeriodRange, toAppZone } from '@tt/shared/time';
import { dayKey, fmtDur } from '@/lib/time-format';
import {
  clientShare,
  dailyBreakdown,
  headlineKpis,
  inactiveUsers,
  peopleTotals,
  topProjects,
} from '@/lib/services/dashboard';

type Period = 'today' | 'week' | 'month';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period }>;
}): Promise<ReactElement> {
  const s = await requireAdmin();
  const sp = await searchParams;
  const period: Period = sp.period === 'today' || sp.period === 'month' ? sp.period : 'week';
  const range = getPeriodRange(period);

  const [kpis, people, share, top, inactive, daily] = await Promise.all([
    headlineKpis(prisma(), s.userId, s.activeCompanyId, range),
    peopleTotals(prisma(), s.userId, s.activeCompanyId, range),
    clientShare(prisma(), s.userId, s.activeCompanyId, range),
    topProjects(prisma(), s.userId, s.activeCompanyId, range, 10),
    inactiveUsers(prisma(), s.userId, s.activeCompanyId, range),
    dailyBreakdown(prisma(), s.userId, s.activeCompanyId, range, 'client'),
  ]);

  if (!kpis.ok) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <EmptyState title="Bez přístupu" />
      </div>
    );
  }

  const periodLabel = { today: 'Dnes', week: 'Tento týden', month: 'Tento měsíc' }[period];
  const sharedTotal = share.ok ? share.value.reduce((a, c) => a + c.totalMs, 0) : 0;

  const dailyByDay = new Map<string, Bucket>();
  if (daily.ok) {
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9', '#ef4444'];
    const labelColor = new Map<string, string>();
    let paletteIndex = 0;
    for (const row of daily.value) {
      const bucket = dailyByDay.get(row.day) ?? { day: row.day, segments: [], total: 0 };
      let color = labelColor.get(row.label);
      if (!color) {
        color = palette[paletteIndex % palette.length]!;
        labelColor.set(row.label, color);
        paletteIndex++;
      }
      bucket.segments.push({ label: row.label, ms: row.totalMs, color });
      bucket.total += row.totalMs;
      dailyByDay.set(row.day, bucket);
    }
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={periodLabel}
        actions={
          <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm dark:bg-zinc-700">
            {(['today', 'week', 'month'] satisfies Period[]).map((p) => (
              <Link
                key={p}
                href={`/dashboard?period=${p}`}
                className={`rounded px-3 py-1 ${
                  period === p
                    ? 'bg-white font-medium shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {{ today: 'Dnes', week: 'Týden', month: 'Měsíc' }[p]}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Celkový čas" value={fmtDur(kpis.value.totalMs)} />
        <Kpi label="Aktivní členové" value={kpis.value.activeMembers.toString()} />
        <Kpi label="Klienti" value={kpis.value.distinctClients.toString()} />
        <Kpi label="Projekty" value={kpis.value.distinctProjects.toString()} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lidé a čas</CardTitle>
          </CardHeader>
          <CardBody>
            {people.ok ? (
              <ul className="space-y-2">
                {people.value
                  .slice()
                  .sort((a, b) => b.totalMs - a.totalMs)
                  .map((p) => {
                    const ratio = kpis.value.totalMs ? p.totalMs / kpis.value.totalMs : 0;
                    return (
                      <li key={p.userId} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {p.fullName}
                          </span>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {fmtDur(p.totalMs)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                          <div
                            className="h-full bg-zinc-900 dark:bg-zinc-100"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podíl klientů</CardTitle>
          </CardHeader>
          <CardBody>
            {share.ok && share.value.length > 0 ? (
              <ul className="space-y-2">
                {share.value
                  .slice()
                  .sort((a, b) => b.totalMs - a.totalMs)
                  .map((c) => {
                    const pct = sharedTotal ? Math.round((c.totalMs / sharedTotal) * 100) : 0;
                    return (
                      <li key={c.clientId ?? 'none'} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 truncate text-zinc-700 dark:text-zinc-300 sm:w-32">
                          {c.clientName}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                          <div
                            className="h-full bg-blue-500 dark:bg-blue-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right font-mono text-zinc-700 dark:text-zinc-300">
                          {pct}%
                        </span>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <EmptyState title="Žádná data" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top projekty</CardTitle>
          </CardHeader>
          <CardBody>
            {top.ok && top.value.length > 0 ? (
              <ul className="space-y-2">
                {top.value.map((p) => (
                  <li key={p.projectId ?? 'none'} className="flex justify-between text-sm">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">
                      {p.projectName}
                    </span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">
                      {fmtDur(p.totalMs)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Žádná data" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bez záznamu</CardTitle>
          </CardHeader>
          <CardBody>
            {inactive.ok && inactive.value.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {inactive.value.map((u) => (
                  <li key={u.userId} className="text-zinc-700 dark:text-zinc-300">
                    {u.fullName}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Všichni aktivní 👏" />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 overflow-x-auto">
        <DailyBreakdown range={range} buckets={Array.from(dailyByDay.values())} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}

interface Bucket {
  day: string;
  segments: { label: string; ms: number; color: string }[];
  total: number;
}

const WEEKDAY_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

const DENSITY = {
  normal: { gapPx: 12, gapClass: 'gap-3' },
  dense: { gapPx: 4, gapClass: 'gap-1' },
} as const;

interface DayCell {
  bucket: Bucket;
  weekday: number; // 0..6, Sun..Sat
  dom: number;
  month: number;
  isToday: boolean;
}

function DailyBreakdown({
  range,
  buckets,
}: {
  range: { start: Date; end: Date };
  buckets: Bucket[];
}): ReactElement {
  const dayMap = new Map(buckets.map((b) => [b.day, b]));
  const cells: DayCell[] = [];
  // `range.start` is already the UTC instant for the first Prague midnight
  // of the period — don't reset hours, that would re-anchor to the server's
  // local midnight. Step in 24h Prague increments and read parts in Prague.
  const cursor = new Date(range.start);
  const stop = new Date(range.end);
  const todayKey = dayKey(new Date());
  while (cursor < stop) {
    const key = dayKey(cursor);
    const z = toAppZone(cursor);
    cells.push({
      bucket: dayMap.get(key) ?? { day: key, segments: [], total: 0 },
      weekday: z.getDay(),
      dom: z.getDate(),
      month: z.getMonth() + 1,
      isToday: key === todayKey,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const legend = new Map<string, string>();
  for (const b of buckets) {
    for (const s of b.segments) if (!legend.has(s.label)) legend.set(s.label, s.color);
  }

  const maxMs = Math.max(1, ...buckets.map((b) => b.total));
  const hasData = buckets.length > 0;
  const density = cells.length > 14 ? DENSITY.dense : DENSITY.normal;
  // Cap the grid width so a small range (e.g. one week) keeps reasonable bar
  // widths instead of stretching across the whole card.
  const maxGridWidth = `${cells.length * 56 + Math.max(0, cells.length - 1) * density.gapPx}px`;
  const isDense = density === DENSITY.dense;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Denní rozpis</CardTitle>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {cells.length === 1 ? 'Jeden den' : `${cells.length} dní`} · stack po klientech
        </span>
      </CardHeader>
      <CardBody>
        {!hasData ? (
          <EmptyState title="Žádná data v období" description="Zkuste zvolit jiné období." />
        ) : (
          <>
            <div
              className={`grid items-end ${density.gapClass}`}
              style={{
                gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
                maxWidth: maxGridWidth,
                minHeight: '12rem',
              }}
            >
              {cells.map(({ bucket, weekday, dom, month, isToday }) => {
                const ratio = bucket.total / maxMs;
                const fallbackColor = bucket.segments[0]?.color;
                return (
                  <div key={bucket.day} className="flex min-w-0 flex-col items-center gap-1.5">
                    {!isDense ? (
                      <span
                        className={`text-[10px] font-medium tabular-nums ${
                          bucket.total > 0
                            ? 'text-zinc-700 dark:text-zinc-300'
                            : 'text-zinc-300 dark:text-zinc-600'
                        }`}
                      >
                        {bucket.total > 0 ? fmtDur(bucket.total) : '—'}
                      </span>
                    ) : null}
                    <div
                      className="relative flex h-40 w-full flex-col-reverse overflow-hidden rounded-md border border-zinc-100 bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/40"
                      title={
                        bucket.total > 0
                          ? `${String(dom).padStart(2, '0')}.${String(month).padStart(2, '0')}. — ${fmtDur(bucket.total)}`
                          : undefined
                      }
                    >
                      {bucket.segments.length === 0 ? (
                        <div className="h-px w-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                      ) : (
                        bucket.segments.map((s) => (
                          <div
                            key={s.label}
                            style={{
                              height: `${(s.ms / maxMs) * 100}%`,
                              backgroundColor: s.color,
                            }}
                            title={`${s.label}: ${fmtDur(s.ms)}`}
                          />
                        ))
                      )}
                      {ratio > 0 && ratio < 0.05 ? (
                        // Minimum visible band so a tiny non-zero day still
                        // renders something the eye can pick up.
                        <div
                          aria-hidden
                          className={
                            'absolute inset-x-0 bottom-0 h-1.5' +
                            (fallbackColor ? '' : ' bg-zinc-300 dark:bg-zinc-700')
                          }
                          style={fallbackColor ? { backgroundColor: fallbackColor } : undefined}
                        />
                      ) : null}
                    </div>
                    <div className="flex w-full flex-col items-center leading-tight">
                      {!isDense ? (
                        <span
                          className={`text-[10px] font-medium ${
                            isToday
                              ? 'text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {WEEKDAY_CS[weekday]}
                        </span>
                      ) : null}
                      <span
                        className={`tabular-nums ${isDense ? 'text-[10px] sm:text-[9px]' : 'text-[10px]'} ${
                          isToday
                            ? 'rounded bg-zinc-900 px-1 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {isDense
                          ? String(dom)
                          : `${String(dom).padStart(2, '0')}.${String(month).padStart(2, '0')}.`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {legend.size > 0 ? (
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-700/60">
                {Array.from(legend.entries()).map(([label, color]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
