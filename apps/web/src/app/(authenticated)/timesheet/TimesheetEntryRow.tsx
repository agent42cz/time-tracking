'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { EditEntryButton } from '@/components/time/EditEntryButton';

export interface TimesheetEntryRowProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  description: string;
  clientName: string | null;
  projectName: string | null;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  tags: { id: string; name: string; color: string }[];
  autoStackOverlaps?: boolean;
}

export function TimesheetEntryRow({
  entryId,
  startedAt,
  endedAt,
  description,
  clientName,
  projectName,
  startLabel,
  endLabel,
  durationLabel,
  tags,
  autoStackOverlaps = false,
}: TimesheetEntryRowProps): ReactElement {
  const router = useRouter();
  return (
    <li className="flex items-center justify-between gap-4 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {description || <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {clientName ? <span>{clientName}</span> : null}
          {projectName ? <span>· {projectName}</span> : null}
          {tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-zinc-600 dark:text-zinc-400">
        <span className="font-mono tabular-nums">
          {startLabel}–{endLabel}
        </span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {durationLabel}
        </span>
        <EditEntryButton
          entryId={entryId}
          startedAt={startedAt}
          endedAt={endedAt}
          autoStackOverlaps={autoStackOverlaps}
          onSaved={() => router.refresh()}
        />
      </div>
    </li>
  );
}
