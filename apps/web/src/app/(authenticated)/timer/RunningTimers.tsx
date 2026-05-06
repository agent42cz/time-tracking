'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { formatDurationHMS } from '@tt/shared';
import { stopTimerAction } from '@/lib/actions/time';
import { notifyTimerChanged } from '@/lib/timer-events';

interface Entry {
  id: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  tags: { name: string; color: string }[];
}

export function RunningTimers({
  entries,
  now,
  onStopped,
}: {
  entries: Entry[];
  now: number | null;
  onStopped: (id: string) => void;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probíhá ({entries.length})</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {entries.map((e) => (
          <RunningRow key={e.id} entry={e} now={now} onStopped={onStopped} />
        ))}
      </CardBody>
    </Card>
  );
}

function RunningRow({
  entry,
  now,
  onStopped,
}: {
  entry: Entry;
  now: number | null;
  onStopped: (id: string) => void;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const elapsed = now == null ? 0 : now - new Date(entry.startedAt).getTime();
  async function handleStop(): Promise<void> {
    setPending(true);
    try {
      const r = await stopTimerAction(entry.id);
      if (r.ok) onStopped(entry.id);
    } finally {
      setPending(false);
    }
    notifyTimerChanged();
  }
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
        <span
          suppressHydrationWarning
          className="font-mono text-base font-semibold text-zinc-900 tabular-nums"
        >
          {formatDurationHMS(elapsed)}
        </span>
        <Button variant="danger" size="sm" loading={pending} onClick={() => void handleStop()}>
          ■ Stop
        </Button>
      </div>
    </div>
  );
}

export { Badge };
