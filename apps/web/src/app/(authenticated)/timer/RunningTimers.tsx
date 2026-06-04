'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { formatDurationHMS } from '@tt/shared';
import { stopTimerAction } from '@/lib/actions/time';
import { notifyTimerChanged } from '@/lib/timer-events';
import { EditEntryButton } from '@/components/time/EditEntryButton';
import { checkOverlap } from '@/components/time/save-with-overlap-check';
import { AutoStackPreviewDialog } from '@/components/time/AutoStackPreviewDialog';
import type { AutoStackActionInput } from '@/lib/actions/auto-stack';

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
  autoStackOverlaps = false,
}: {
  entries: Entry[];
  now: number | null;
  onStopped: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probíhá ({entries.length})</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {entries.map((e) => (
          <RunningRow
            key={e.id}
            entry={e}
            now={now}
            onStopped={onStopped}
            autoStackOverlaps={autoStackOverlaps}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function RunningRow({
  entry,
  now,
  onStopped,
  autoStackOverlaps = false,
}: {
  entry: Entry;
  now: number | null;
  onStopped: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [autoStackOpen, setAutoStackOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<
    AutoStackActionInput['candidate'] | null
  >(null);
  const elapsed = now == null ? 0 : now - new Date(entry.startedAt).getTime();
  async function handleStop(): Promise<void> {
    setPending(true);
    try {
      if (!autoStackOverlaps) {
        const r = await stopTimerAction(entry.id);
        if (r.ok) onStopped(entry.id);
        notifyTimerChanged();
        setPending(false);
        return;
      }
      const nowIso = new Date().toISOString();
      const candidate: AutoStackActionInput['candidate'] = {
        kind: 'stop',
        id: entry.id,
        startedAt: entry.startedAt,
        endedAt: nowIso,
      };
      const probe = await checkOverlap(candidate);
      if (probe.kind === 'overlap') {
        setPendingCandidate(candidate);
        setAutoStackOpen(true);
        setPending(false);
        return;
      }
      if (probe.kind === 'error') {
        window.alert('Nepodařilo se ověřit překryvy. Zkuste to znovu.');
        setPending(false);
        return;
      }
      const r = await stopTimerAction(entry.id);
      if (r.ok) onStopped(entry.id);
      notifyTimerChanged();
      setPending(false);
    } catch {
      setPending(false);
    }
  }
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 rounded-md border border-zinc-100 dark:border-zinc-700/60 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
            {entry.description || (
              <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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
        <div className="flex shrink-0 w-full sm:w-auto items-center gap-3">
          <span
            suppressHydrationWarning
            className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
          >
            {formatDurationHMS(elapsed)}
          </span>
          <EditEntryButton
            entryId={entry.id}
            startedAt={entry.startedAt}
            endedAt={null}
            autoStackOverlaps={autoStackOverlaps}
            onSaved={() => notifyTimerChanged()}
            className="h-10 w-10 sm:h-8 sm:w-8"
          />
          <Button
            variant="danger"
            size="sm"
            loading={pending}
            onClick={() => void handleStop()}
            className="h-10 sm:h-8"
          >
            ■ Stop
          </Button>
        </div>
      </div>
      {autoStackOpen && pendingCandidate ? (
        <AutoStackPreviewDialog
          open
          candidate={pendingCandidate}
          onClose={() => {
            setAutoStackOpen(false);
            setPendingCandidate(null);
          }}
          onSaveWithoutShift={async () => {
            const r = await stopTimerAction(entry.id);
            if (r.ok) onStopped(entry.id);
            notifyTimerChanged();
          }}
          onShifted={() => {
            onStopped(entry.id);
            notifyTimerChanged();
          }}
        />
      ) : null}
    </>
  );
}

export { Badge };
