'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '@tt/ui';
import { EditEntryDialog } from './EditEntryDialog';

export interface EditEntryButtonProps {
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  autoStackOverlaps?: boolean;
  onSaved?(updated: { startedAt: string; endedAt: string | null }): void;
  className?: string;
}

export function EditEntryButton({
  entryId,
  startedAt,
  endedAt,
  autoStackOverlaps = false,
  onSaved,
  className,
}: EditEntryButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Upravit"
        className={className}
      >
        ✎
      </Button>
      {open ? (
        <EditEntryDialog
          entryId={entryId}
          initial={{ startedAt, endedAt }}
          open={open}
          onClose={() => setOpen(false)}
          autoStackOverlaps={autoStackOverlaps}
          onSaved={(u) => {
            onSaved?.(u);
          }}
        />
      ) : null}
    </>
  );
}
