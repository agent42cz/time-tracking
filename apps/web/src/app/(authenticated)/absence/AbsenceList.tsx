'use client';

import { useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  useConfirm,
} from '@tt/ui';
import type { AbsenceKind } from '@prisma/client';
import { deleteAbsenceAction, markAbsenceSeenAction } from '@/lib/actions/absences';
import {
  ABSENCE_KIND_CLASSES,
  ABSENCE_KIND_LABELS,
  formatDayRange,
  weekdayLabelForDay,
} from './kinds';

export interface AbsenceListItem {
  id: string;
  userId: string;
  userName: string;
  kind: AbsenceKind;
  startDate: string;
  endDate: string;
  note: string;
  seen: boolean;
}

/**
 * The notice list. Rows the viewer hasn't seen carry a dot and expand-on-open:
 * physically opening a row is what clears it (the brief: "až to já tu položku
 * fyzicky otevřu / nebo odkliknu, že jsem to viděl, tak ikonka zmizí").
 */
export function AbsenceList({
  items,
  viewerId,
  canAcknowledge,
  title,
  emptyText,
}: {
  items: AbsenceListItem[];
  viewerId: string;
  canAcknowledge: boolean;
  title: string;
  emptyText: string;
}): ReactElement {
  const router = useRouter();
  const confirm = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(item: AbsenceListItem): Promise<void> {
    const next = openId === item.id ? null : item.id;
    setOpenId(next);
    if (next && canAcknowledge && !item.seen) {
      await markAbsenceSeenAction(item.id);
      router.refresh();
    }
  }

  async function remove(item: AbsenceListItem): Promise<void> {
    const ok = await confirm({
      title: 'Zrušit nepřítomnost?',
      description: `${item.userName} — ${formatDayRange(item.startDate, item.endDate)}. Záznam se smaže a nadřízený ho v přehledu už neuvidí.`,
      confirmLabel: 'Zrušit záznam',
      cancelLabel: 'Ponechat',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      await deleteAbsenceAction(item.id);
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <EmptyState title={emptyText} />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
            {items.map((item) => {
              const isOpen = openId === item.id;
              const unseen = canAcknowledge && !item.seen;
              return (
                <li key={item.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => void toggle(item)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        'h-2 w-2 shrink-0 rounded-full ' +
                        (unseen ? 'bg-indigo-600' : 'bg-transparent')
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            'text-sm ' +
                            (unseen
                              ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-700 dark:text-zinc-300')
                          }
                        >
                          {item.userName}
                        </span>
                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                            ABSENCE_KIND_CLASSES[item.kind]
                          }
                        >
                          {ABSENCE_KIND_LABELS[item.kind]}
                        </span>
                        {unseen ? <Badge tone="info">Nové</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                        {weekdayLabelForDay(item.startDate)}{' '}
                        {formatDayRange(item.startDate, item.endDate)}
                      </span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-7 pb-2 pt-1">
                      {item.note ? (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{item.note}</p>
                      ) : (
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">Bez poznámky</p>
                      )}
                      {(item.userId === viewerId || canAcknowledge) && (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="ml-auto"
                          disabled={busy === item.id}
                          onClick={() => void remove(item)}
                        >
                          {busy === item.id ? 'Ruším…' : 'Zrušit záznam'}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
