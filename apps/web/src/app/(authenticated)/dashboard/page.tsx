import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { getPeriodRange } from '@tt/shared/time';
import {
  clientShare,
  dailyBreakdown,
  headlineKpis,
  inactiveUsers,
  peopleTotals,
  topProjects,
} from '@/lib/services/dashboard';

type Period = 'today' | 'week' | 'month';

function fmtH(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

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

  // Daily group: bucket by day, total per day for the chart.
  const dailyByDay = new Map<string, { day: string; segments: { label: string; ms: number; color: string }[]; total: number }>();
  if (daily.ok) {
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9', '#ef4444'];
    const labelColor = new Map<string, string>();
    let pi = 0;
    for (const row of daily.value) {
      const bucket = dailyByDay.get(row.day) ?? { day: row.day, segments: [], total: 0 };
      let color = labelColor.get(row.label);
      if (!color) {
        color = palette[pi % palette.length]!;
        labelColor.set(row.label, color);
        pi++;
      }
      bucket.segments.push({ label: row.label, ms: row.totalMs, color });
      bucket.total += row.totalMs;
      dailyByDay.set(row.day, bucket);
    }
  }
  const dailyMax = Math.max(1, ...Array.from(dailyByDay.values()).map((d) => d.total));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={periodLabel}
        actions={
          <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm">
            {(['today', 'week', 'month'] as const).map((p) => (
              <Link
                key={p}
                href={`/dashboard?period=${p}`}
                className={`rounded px-3 py-1 ${period === p ? 'bg-white shadow-sm font-medium' : 'text-zinc-600'}`}
              >
                {{ today: 'Dnes', week: 'Týden', month: 'Měsíc' }[p]}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Celkový čas" value={fmtH(kpis.value.totalMs)} />
        <Kpi label="Aktivní členové" value={kpis.value.activeMembers.toString()} />
        <Kpi label="Klienti" value={kpis.value.distinctClients.toString()} />
        <Kpi label="Projekty" value={kpis.value.distinctProjects.toString()} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                          <span className="font-medium text-zinc-900">{p.fullName}</span>
                          <span className="font-mono text-zinc-700">{fmtH(p.totalMs)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full bg-zinc-900"
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
                        <span className="w-32 shrink-0 truncate text-zinc-700">{c.clientName}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right font-mono text-zinc-700">
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
                  <li
                    key={p.projectId ?? 'none'}
                    className="flex justify-between text-sm"
                  >
                    <span className="truncate text-zinc-700">{p.projectName}</span>
                    <span className="font-mono text-zinc-900">{fmtH(p.totalMs)}</span>
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
                  <li key={u.userId} className="text-zinc-700">
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

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Denní rozpis</CardTitle>
          </CardHeader>
          <CardBody>
            {dailyByDay.size > 0 ? (
              <div className="flex h-48 items-end gap-2">
                {Array.from(dailyByDay.values())
                  .sort((a, b) => a.day.localeCompare(b.day))
                  .map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="flex h-40 w-full flex-col-reverse overflow-hidden rounded">
                        {d.segments.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              height: `${(s.ms / dailyMax) * 100}%`,
                              backgroundColor: s.color,
                            }}
                            title={`${s.label}: ${fmtH(s.ms)}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(d.day + 'T00:00:00Z').toLocaleDateString('cs-CZ', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState title="Žádná data" />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
