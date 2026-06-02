'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button, Card, CardBody, EmptyState, useConfirm } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { deleteEntryAction, playAgainAction } from '@/lib/actions/time';
import { notifyTimerChanged } from '@/lib/timer-events';
import { EditEntryButton } from '@/components/time/EditEntryButton';
import { fmtTime, fmtDur } from '@/lib/time-format';
import { groupRecentByDay, type RecentEntryInput } from '@/lib/recent';

export interface HistoryEntryView extends RecentEntryInput {
  endedAt: string; // history entries are always completed
}

export function TimerHistory({
  entries,
  onDeleted,
  autoStackOverlaps = false,
}: {
  entries: HistoryEntryView[];
  onDeleted: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const t = useTranslations('timer.history');
  if (entries.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title={t('empty')} description={t('emptyHint')} />
        </CardBody>
      </Card>
    );
  }
  const groups = groupRecentByDay(entries, new Date());
  let lastMonthKey = '';
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const showMonth = g.monthKey !== lastMonthKey;
        lastMonthKey = g.monthKey;
        return (
          <div key={g.key} className="space-y-2">
            {showMonth ? (
              <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {g.monthLabel}
              </p>
            ) : null}
            <Card>
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-700/60 px-4 py-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {g.label}
                </span>
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {fmtDur(g.total)}
                </span>
              </div>
              <CardBody>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                  {g.items.map((e) => (
                    <Row
                      key={e.id}
                      entry={e as HistoryEntryView}
                      onDeleted={onDeleted}
                      autoStackOverlaps={autoStackOverlaps}
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  entry,
  onDeleted,
  autoStackOverlaps = false,
}: {
  entry: HistoryEntryView;
  onDeleted: (id: string) => void;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [deletePending, setDeletePending] = useState(false);
  const [playPending, setPlayPending] = useState(false);
  const confirm = useConfirm();
  const t = useTranslations('timer.confirm');
  async function runDelete(): Promise<void> {
    const ok = await confirm({
      title: t('deleteEntryTitle'),
      description: t('deleteEntryDescription'),
    });
    if (!ok) return;
    setDeletePending(true);
    try {
      const r = await deleteEntryAction(entry.id);
      if (r.ok) onDeleted(entry.id);
    } finally {
      setDeletePending(false);
    }
    notifyTimerChanged();
  }
  async function runPlayAgain(): Promise<void> {
    setPlayPending(true);
    try {
      await playAgainAction(entry.id);
    } finally {
      setPlayPending(false);
    }
    notifyTimerChanged();
  }
  const startedAt = new Date(entry.startedAt);
  const endedAt = new Date(entry.endedAt);
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {entry.description || (
            <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {entry.clientName ? <span>{entry.clientName}</span> : null}
          {entry.projectName ? <span>· {entry.projectName}</span> : null}
          {entry.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-mono tabular-nums">
          {fmtTime(startedAt)}–{fmtTime(endedAt)}
        </span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {fmtDur(endedAt.getTime() - startedAt.getTime())}
        </span>
        <EditEntryButton
          entryId={entry.id}
          startedAt={entry.startedAt}
          endedAt={entry.endedAt}
          autoStackOverlaps={autoStackOverlaps}
          onSaved={() => notifyTimerChanged()}
        />
        <Button
          size="sm"
          variant="ghost"
          loading={playPending}
          disabled={deletePending}
          onClick={() => void runPlayAgain()}
          title="Spustit znovu"
        >
          ▶
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={deletePending}
          disabled={playPending}
          onClick={() => void runDelete()}
          title="Smazat"
        >
          ✕
        </Button>
      </div>
    </li>
  );
}
