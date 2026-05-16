'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { EditEntryButton } from '@/components/time/EditEntryButton';

export interface ReportsRowActionsProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  autoStackOverlaps?: boolean;
}

export function ReportsRowActions({
  entryId,
  startedAt,
  endedAt,
  autoStackOverlaps = false,
}: ReportsRowActionsProps): ReactElement {
  const router = useRouter();
  return (
    <EditEntryButton
      entryId={entryId}
      startedAt={startedAt}
      endedAt={endedAt}
      autoStackOverlaps={autoStackOverlaps}
      onSaved={() => router.refresh()}
    />
  );
}
