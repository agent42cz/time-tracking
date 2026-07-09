'use client';
import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import type { FundProgress, ClientFund } from '@/lib/services/dashboard';

const fmtH = (min: number) => `${(min / 60).toFixed(1)} h`;
const pct = (worked: number, target: number) =>
  target > 0 ? Math.min(100, (worked / target) * 100) : 0;

function Bar({ worked, target }: { worked: number; target: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400"
          style={{ width: `${pct(worked, target)}%` }}
        />
      </div>
      <span className="w-24 text-right text-xs tabular-nums text-zinc-500">
        {fmtH(worked)} / {fmtH(target)}
      </span>
    </div>
  );
}

function DayStrip({ client }: { client: ClientFund }): React.ReactElement | null {
  if (client.days.length === 0) return null;
  return (
    <div className="mt-1 flex gap-1">
      {client.days.map((d) => {
        const green = pct(d.allocatedMinutes, d.targetMinutes);
        const red = d.isPast ? 100 - green : 0;
        return (
          <div key={d.date} className="flex-1">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
              <div className="h-full bg-emerald-500" style={{ width: `${green}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${red}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClientFundsCard({
  initial,
  companyId,
}: {
  initial: FundProgress;
  companyId: string;
}): React.ReactElement {
  const [data, setData] = useState<FundProgress>(initial);
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`/api/v1/dashboard/funds?company=${encodeURIComponent(companyId)}`, {
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j) setData(j as FundProgress);
        })
        .catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, [companyId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pracovní fondy klientů</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {data.clients.map((c) => (
          <div key={c.clientId} className="space-y-1">
            <div className="text-sm font-medium">{c.clientName}</div>
            <div className="text-[10px] uppercase text-zinc-400">Týden</div>
            <Bar worked={c.weekly.workedMinutes} target={c.weekly.targetMinutes} />
            <DayStrip client={c} />
            <div className="text-[10px] uppercase text-zinc-400">Měsíc</div>
            <Bar worked={c.monthly.workedMinutes} target={c.monthly.targetMinutes} />
          </div>
        ))}
        <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="text-sm font-medium">Celkem (týden)</div>
          <Bar
            worked={data.combined.weekly.workedMinutes}
            target={data.combined.weekly.targetMinutes}
          />
        </div>
      </CardBody>
    </Card>
  );
}
