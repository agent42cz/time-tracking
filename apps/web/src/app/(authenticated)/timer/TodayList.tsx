'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState } from '@tt/ui';
import { deleteEntryAction, playAgainAction } from '@/lib/actions/time';

interface Entry {
  id: string;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string;
  tags: { name: string; color: string }[];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDur(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

export function TodayList({ entries }: { entries: Entry[] }): ReactElement {
  const total = entries.reduce(
    (acc, e) => acc + (new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()),
    0,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dnes</CardTitle>
        <span className="text-sm text-zinc-500">
          Celkem:{' '}
          <span className="font-mono font-semibold text-zinc-900">
            {Math.floor(total / 3600000)}h {Math.floor((total % 3600000) / 60000)}m
          </span>
        </span>
      </CardHeader>
      <CardBody>
        {entries.length === 0 ? (
          <EmptyState
            title="Žádné záznamy dnes"
            description="Spusťte nahoře nové měření nebo přidejte ruční zápis."
          />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entries.map((e) => (
              <Row key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ entry }: { entry: Entry }): ReactElement {
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">
          {entry.description || <span className="text-zinc-400">(bez popisu)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          {entry.clientName ? <span>{entry.clientName}</span> : null}
          {entry.projectName ? <span>· {entry.projectName}</span> : null}
          {entry.tags.map((t, i) => (
            <span
              key={i}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm text-zinc-600">
        <span className="font-mono tabular-nums">
          {fmtTime(entry.startedAt)}–{fmtTime(entry.endedAt)}
        </span>
        <span className="font-mono font-semibold text-zinc-900 tabular-nums">
          {fmtDur(entry.startedAt, entry.endedAt)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => startTransition(() => playAgainAction(entry.id).then(() => undefined))}
          title="Spustit znovu"
        >
          ▶
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() =>
            startTransition(() => deleteEntryAction(entry.id).then(() => undefined))
          }
          title="Smazat"
        >
          ✕
        </Button>
      </div>
    </li>
  );
}
