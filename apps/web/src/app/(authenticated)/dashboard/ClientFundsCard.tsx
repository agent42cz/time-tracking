'use client';
import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import type { FundProgress, ClientFund, FundBar } from '@/lib/services/dashboard';

const fmtH = (min: number) => `${(min / 60).toFixed(1)} h`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0);

// Green = worked so far. Red = how far behind schedule we are right now
// (expected-to-date minus worked). The rest of the track stays neutral.
// Below the bar: the exact hours per colour + how much is left to the limit.
function Bar({ bar }: { bar: FundBar }): React.ReactElement {
  const green = pct(bar.workedMinutes, bar.targetMinutes);
  const shortfall = Math.max(0, bar.expectedToDateMinutes - bar.workedMinutes);
  const red = pct(shortfall, bar.targetMinutes);
  const remaining = Math.max(0, bar.targetMinutes - bar.workedMinutes);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div className="h-full bg-emerald-500" style={{ width: `${green}%` }} />
        <div className="h-full bg-red-500" style={{ width: `${red}%` }} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums">
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {fmtH(bar.workedMinutes)}
        </span>
        {shortfall > 0 ? (
          <span className="font-medium text-red-600 dark:text-red-400">
            skluz {fmtH(shortfall)}
          </span>
        ) : null}
        <span className="ml-auto text-zinc-500 dark:text-zinc-400">
          {remaining > 0
            ? `do limitu zbývá ${fmtH(remaining)} z ${fmtH(bar.targetMinutes)}`
            : `limit ${fmtH(bar.targetMinutes)} splněn ✓`}
        </span>
      </div>
    </div>
  );
}

// Per-day strip: each working day that has arrived (today included) shows green
// for what's done and red for its shortfall — a later day lights red even if an
// earlier one isn't full.
function DayStrip({ client }: { client: ClientFund }): React.ReactElement | null {
  if (client.days.length === 0) return null;
  return (
    <div className="mt-1 flex gap-1">
      {client.days.map((d) => {
        const green = pct(d.allocatedMinutes, d.targetMinutes);
        const red = d.hasArrived ? 100 - green : 0;
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
            {c.days.length > 0 ? (
              <>
                <div className="text-[10px] uppercase text-zinc-400">Dny</div>
                <DayStrip client={c} />
              </>
            ) : null}
            <div className="text-[10px] uppercase text-zinc-400">Týden</div>
            <Bar bar={c.weekly} />
            <div className="text-[10px] uppercase text-zinc-400">Měsíc</div>
            <Bar bar={c.monthly} />
          </div>
        ))}
        <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="text-sm font-medium">Celkem</div>
          <div className="text-[10px] uppercase text-zinc-400">Týden</div>
          <Bar bar={data.combined.weekly} />
          <div className="text-[10px] uppercase text-zinc-400">Měsíc</div>
          <Bar bar={data.combined.monthly} />
        </div>
      </CardBody>
    </Card>
  );
}
