'use client';

import type { ReactElement } from 'react';
import { useEffect, useState, useTransition } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { stopTimerAction } from '@/lib/actions/time';

interface Entry {
  id: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  tags: { name: string; color: string }[];
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RunningTimers({ entries }: { entries: Entry[] }): ReactElement {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probíhá ({entries.length})</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {entries.map((e) => (
          <RunningRow key={e.id} entry={e} now={now} />
        ))}
      </CardBody>
    </Card>
  );
}

function RunningRow({ entry, now }: { entry: Entry; now: number }): ReactElement {
  const [pending, startTransition] = useTransition();
  const elapsed = now - new Date(entry.startedAt).getTime();
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-100 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-900">
          {entry.description || <span className="text-zinc-400">(bez popisu)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          {entry.clientName ? <span>{entry.clientName}</span> : null}
          {entry.projectName ? <span>· {entry.projectName}</span> : null}
          {entry.tags.map((t, i) => (
            <span
              key={i}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-base font-semibold text-zinc-900 tabular-nums">
          {fmtDuration(elapsed)}
        </span>
        <Button
          variant="danger"
          size="sm"
          loading={pending}
          onClick={() => startTransition(() => stopTimerAction(entry.id).then(() => undefined))}
        >
          ■ Stop
        </Button>
      </div>
    </div>
  );
}

export { Badge };
