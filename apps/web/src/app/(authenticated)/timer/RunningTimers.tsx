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
import { ClientName } from '@/components/ClientName';

interface Entry {
  id: string;
  description: string;
  clientName: string | null;
  clientColor: string | null;
  projectName: string | null;
  startedAt: string;
}

export function RunningTimers({
  entries,
  now,
  onStopped,
  beforeStop,
  onStopConflict,
  autoStackOverlaps = false,
}: {
  entries: Entry[];
  now: number | null;
  onStopped: (id: string) => void;
  /**
   * Called at the top of every stop attempt (US-103): re-fetches and
   * resolves to whether `id` is still genuinely running afterwards. When it
   * resolves `false`, the caller already refreshed the list and surfaced a
   * neutral notice — the row must skip its own mutation.
   */
  beforeStop: (id: string) => Promise<boolean>;
  /**
   * Called when the stop mutation itself discovers the entry was no longer
   * running (a race lost between `beforeStop` and the mutation reaching the
   * server) — refreshes the list and surfaces the same neutral notice
   * instead of an error.
   */
  onStopConflict: () => void;
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
            beforeStop={beforeStop}
            onStopConflict={onStopConflict}
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
  beforeStop,
  onStopConflict,
  autoStackOverlaps = false,
}: {
  entry: Entry;
  now: number | null;
  onStopped: (id: string) => void;
  beforeStop: (id: string) => Promise<boolean>;
  onStopConflict: () => void;
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
      // US-103: re-fetch before acting on this id at all. Between the last
      // render and this click, another tab/window/the extension may already
      // have stopped it — `beforeStop` refetches and tells us whether it's
      // still genuinely running.
      const stillRunning = await beforeStop(entry.id);
      if (!stillRunning) {
        setPending(false);
        return;
      }
      if (!autoStackOverlaps) {
        const r = await stopTimerAction(entry.id);
        if (r.ok) {
          onStopped(entry.id);
        } else if (r.reason === 'not_running') {
          // Narrower race: still running above, stopped elsewhere by the
          // time this mutation reached the server.
          onStopConflict();
        }
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
      if (r.ok) {
        onStopped(entry.id);
      } else if (r.reason === 'not_running') {
        onStopConflict();
      }
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
            {entry.clientName ? (
              <ClientName name={entry.clientName} color={entry.clientColor} />
            ) : null}
            {entry.projectName ? <span>· {entry.projectName}</span> : null}
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
            if (r.ok) {
              onStopped(entry.id);
            } else if (r.reason === 'not_running') {
              onStopConflict();
            }
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
