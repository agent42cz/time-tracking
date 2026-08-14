'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  useConfirm,
} from '@tt/ui';
import type { AbsenceKind } from '@prisma/client';
import {
  deleteAbsenceAction,
  markAbsenceSeenAction,
  updateAbsenceAction,
} from '@/lib/actions/absences';
import {
  ABSENCE_KIND_CLASSES,
  ABSENCE_KIND_LABELS,
  ABSENCE_KIND_ORDER,
  formatDayRange,
  formatDayRangeWithWeekday,
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
  minDate,
  title,
  emptyText,
}: {
  items: AbsenceListItem[];
  viewerId: string;
  canAcknowledge: boolean;
  /** Tomorrow in Europe/Prague, from the server — see `AbsenceForm`. */
  minDate: string;
  title: string;
  emptyText: string;
}): ReactElement {
  const router = useRouter();
  const confirm = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(item: AbsenceListItem): Promise<void> {
    const next = openId === item.id ? null : item.id;
    setOpenId(next);
    setEditId(null);
    if (next && canAcknowledge && !item.seen) {
      await markAbsenceSeenAction(item.id);
      router.refresh();
    }
  }

  async function remove(item: AbsenceListItem): Promise<void> {
    const ok = await confirm({
      title: 'Smazat nepřítomnost?',
      description: `${item.userName} — ${formatDayRange(item.startDate, item.endDate)}. Záznam se smaže a nadřízený ho v přehledu už neuvidí.`,
      confirmLabel: 'Smazat záznam',
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
              const canWrite = item.userId === viewerId || canAcknowledge;
              // Not offered once the absence has started: `updateAbsence`
              // re-checks the lead time against the *new* start day, so the
              // service would reject the save anyway. A finished or running
              // notice is corrected by deleting it.
              const canEdit = canWrite && item.startDate >= minDate;
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
                        {formatDayRangeWithWeekday(item.startDate, item.endDate)}
                      </span>
                    </span>
                  </button>
                  {isOpen && editId === item.id ? (
                    <AbsenceEditForm
                      item={item}
                      minDate={minDate}
                      onCancel={() => setEditId(null)}
                      onSaved={() => {
                        setEditId(null);
                        router.refresh();
                      }}
                    />
                  ) : isOpen ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-7 pb-2 pt-1">
                      {item.note ? (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{item.note}</p>
                      ) : (
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">Bez poznámky</p>
                      )}
                      {canWrite && (
                        <div className="ml-auto flex items-center gap-2">
                          {canEdit && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditId(item.id)}
                            >
                              Upravit záznam
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy === item.id}
                            onClick={() => void remove(item)}
                          >
                            {busy === item.id ? 'Mažu…' : 'Smazat záznam'}
                          </Button>
                        </div>
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

/**
 * Correcting a notice in place — the same four fields as `AbsenceForm`,
 * prefilled. A mistyped date is the common mistake, and delete-and-retype was
 * the only way to fix it.
 *
 * Nothing is validated here beyond what the date inputs enforce: the service
 * re-checks the lead time and the range on every patch, and its Czech message
 * is what lands in the `Alert`. Saving drops everyone's `AbsenceRead` rows, so
 * a corrected date re-notifies — that is `updateAbsence`'s existing behaviour,
 * not something this form decides.
 */
function AbsenceEditForm({
  item,
  minDate,
  onCancel,
  onSaved,
}: {
  item: AbsenceListItem;
  minDate: string;
  onCancel: () => void;
  onSaved: () => void;
}): ReactElement {
  const [startDate, setStartDate] = useState(item.startDate);
  const [endDate, setEndDate] = useState(item.endDate);
  const [kind, setKind] = useState<string>(item.kind);
  const [note, setNote] = useState(item.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateAbsenceAction(item.id, { kind, startDate, endDate, note });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 px-7 pb-3 pt-1">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Od" htmlFor={`absence-start-${item.id}`}>
          <Input
            id={`absence-start-${item.id}`}
            type="date"
            required
            min={minDate}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              // Same rule as the create form: a start past the end drags the
              // end along, so the range can never be saved backwards.
              if (e.target.value > endDate) setEndDate(e.target.value);
            }}
          />
        </Field>
        <Field label="Do" htmlFor={`absence-end-${item.id}`}>
          <Input
            id={`absence-end-${item.id}`}
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field label="Důvod" htmlFor={`absence-kind-${item.id}`}>
          <Select
            id={`absence-kind-${item.id}`}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {ABSENCE_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {ABSENCE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Poznámka (nepovinné)" htmlFor={`absence-note-${item.id}`}>
          <Input
            id={`absence-note-${item.id}`}
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Zpět
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Ukládám…' : 'Uložit změny'}
        </Button>
      </div>
    </form>
  );
}
