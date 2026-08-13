'use client';

import { useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@tt/ui';
import { markAllAbsencesSeenAction } from '@/lib/actions/absences';

/** "Viděl jsem to" for the whole list — the odkliknutí half of the brief. */
export function MarkAllSeenButton({ count }: { count: number }): ReactElement | null {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (count === 0) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await markAllAbsencesSeenAction();
        setPending(false);
        router.refresh();
      }}
    >
      Označit vše jako přečtené ({count})
    </Button>
  );
}
