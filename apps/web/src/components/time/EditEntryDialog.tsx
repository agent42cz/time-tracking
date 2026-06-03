'use client';

import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal, Field, Input } from '@tt/ui';
import { updateEntryAction } from '@/lib/actions/time';
import { checkOverlap } from './save-with-overlap-check';
import { AutoStackPreviewDialog } from './AutoStackPreviewDialog';
import type { AutoStackActionInput } from '@/lib/actions/auto-stack';

export interface EditEntryDialogProps {
  entryId: string;
  initial: { startedAt: string; endedAt: string | null };
  open: boolean;
  onClose(): void;
  onSaved(updated: { startedAt: string; endedAt: string | null }): void;
  autoStackOverlaps: boolean;
}

function isoToLocalInput(iso: string): string {
  // datetime-local expects YYYY-MM-DDTHH:mm in *local* time, no timezone.
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // local is YYYY-MM-DDTHH:mm in local time; new Date(local) parses it as local.
  return new Date(local).toISOString();
}

function fmtDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

export function EditEntryDialog({
  entryId,
  initial,
  open,
  onClose,
  onSaved,
  autoStackOverlaps,
}: EditEntryDialogProps): ReactElement {
  const t = useTranslations('timeEntry.edit');
  const [start, setStart] = useState<string>(() => isoToLocalInput(initial.startedAt));
  const [end, setEnd] = useState<string>(() =>
    initial.endedAt ? isoToLocalInput(initial.endedAt) : '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoStackOpen, setAutoStackOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<
    AutoStackActionInput['candidate'] | null
  >(null);
  const [pendingPatch, setPendingPatch] = useState<{
    startedAt: string;
    endedAt?: string | null;
  } | null>(null);

  const wasRunning = initial.endedAt === null;
  const duration = useMemo(
    () => (end ? fmtDuration(localInputToIso(start), localInputToIso(end)) : ''),
    [start, end],
  );

  async function doDirectSave(
    patch: { startedAt: string; endedAt?: string | null },
    startIso: string,
    endIso: string | null,
  ): Promise<void> {
    const r = await updateEntryAction(entryId, patch);
    if (r.ok) {
      onSaved({ startedAt: startIso, endedAt: end ? endIso : null });
      onClose();
      return;
    }
    // updateEntryAction already returns Czech strings for invalid_window/future_timestamp/not_found.
    setError(r.error);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    if (!wasRunning && !end) {
      setError(t('errors.endRequiredForStopped'));
      return;
    }
    setPending(true);
    try {
      const startIso = localInputToIso(start);
      const endIso: string | null = end ? localInputToIso(end) : null;
      const patch: { startedAt: string; endedAt?: string | null } = { startedAt: startIso };
      // Only include endedAt when the user filled it in (running timers stay running).
      if (end) patch.endedAt = endIso;

      const willBeClosed = endIso !== null;
      if (!autoStackOverlaps || !willBeClosed) {
        await doDirectSave(patch, startIso, endIso);
        return;
      }

      // Build candidate for overlap check.
      const candidate: AutoStackActionInput['candidate'] = {
        kind: wasRunning ? 'stop' : 'edit',
        id: entryId,
        startedAt: startIso,
        endedAt: endIso,
      };

      const probe = await checkOverlap(candidate);
      if (probe.kind === 'overlap') {
        setPendingCandidate(candidate);
        setPendingPatch(patch);
        setAutoStackOpen(true);
        return;
      }
      if (probe.kind === 'error') {
        setError('Nepodařilo se ověřit překryvy. Zkuste to znovu.');
        return;
      }
      // no-overlap → direct save
      await doDirectSave(patch, startIso, endIso);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ConfirmModal
        open={open}
        title={t('title')}
        confirmLabel={t('save')}
        cancelLabel={t('cancel')}
        loading={pending}
        onConfirm={() => void handleSave()}
        onCancel={onClose}
      >
        <div className="space-y-3 md:space-y-4">
          <Field label={t('startedAt')} htmlFor="edit-entry-start">
            <Input
              id="edit-entry-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field
            label={t('endedAt')}
            htmlFor="edit-entry-end"
            hint={wasRunning && !end ? t('keepRunning') : undefined}
          >
            <Input
              id="edit-entry-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              // Browser-required only for stopped entries; we re-check in handleSave.
              required={!wasRunning}
            />
          </Field>
          {duration ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('duration')}: <span className="font-mono font-semibold">{duration}</span>
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </ConfirmModal>
      {autoStackOpen && pendingCandidate && pendingPatch ? (
        <AutoStackPreviewDialog
          open
          candidate={pendingCandidate}
          onClose={() => setAutoStackOpen(false)}
          onSaveWithoutShift={async () => {
            const r = await updateEntryAction(entryId, pendingPatch);
            if (r.ok) {
              onSaved({
                startedAt: pendingPatch.startedAt,
                endedAt: pendingPatch.endedAt ?? null,
              });
              onClose();
            } else {
              setError(r.error);
            }
          }}
          onShifted={() => {
            onSaved({
              startedAt: pendingCandidate.startedAt,
              endedAt: pendingCandidate.endedAt,
            });
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
