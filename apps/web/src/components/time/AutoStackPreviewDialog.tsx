'use client';

import { useEffect, useState, useTransition, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@tt/ui';
import {
  previewAutoStackAction,
  saveEntryWithAutoStackAction,
  type AutoStackActionInput,
  type AutoStackActionResult,
} from '@/lib/actions/auto-stack';

type Direction = 'forward' | 'backward';
type Plan = Extract<AutoStackActionResult, { ok: true }>['plan']; // WirePlan; timestamps are ISO strings

export type AutoStackPreviewDialogProps = {
  open: boolean;
  candidate: AutoStackActionInput['candidate'];
  onClose: () => void;
  onSaveWithoutShift: () => Promise<void> | void;
  onShifted: (candidateId: string) => void;
};

function formatRange(startedAt: string, endedAt: string): string {
  const fmt = (d: string): string =>
    new Date(d).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startedAt)}–${fmt(endedAt)}`;
}

export function AutoStackPreviewDialog(props: AutoStackPreviewDialogProps): ReactElement | null {
  const { open, candidate, onClose, onSaveWithoutShift, onShifted } = props;
  const t = useTranslations('autoStack');
  const [direction, setDirection] = useState<Direction>('forward');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPlan(null);
    startTransition(async () => {
      const result = await previewAutoStackAction({ candidate, direction });
      if (result.ok) {
        setPlan(result.plan);
      } else {
        setError(result.error);
      }
    });
  }, [open, direction, candidate]);

  if (!open) return null;

  const handleSave = (): void => {
    startTransition(async () => {
      const result = await saveEntryWithAutoStackAction({ candidate, direction });
      if (result.ok) {
        onShifted(result.candidateId);
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  const isBackwardDegenerate =
    direction === 'backward' &&
    plan !== null &&
    plan.shifts.length === 0 &&
    new Date(plan.candidateAfter.startedAt).getTime() === new Date(candidate.startedAt).getTime();

  return (
    <ConfirmModal
      open={open}
      title={t('dialogTitle')}
      onCancel={onClose}
      cancelLabel={t('cancel')}
      confirmLabel={t('saveWithShift')}
      onConfirm={handleSave}
      loading={pending || plan === null || isBackwardDegenerate}
    >
      <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">{t('dialogSubtitle')}</p>
      <div role="tablist" className="mb-4 flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          className={`rounded px-3 py-1 text-sm ${
            direction === 'forward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('forward')}
          disabled={pending}
        >
          {t('directionForward')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'backward'}
          className={`rounded px-3 py-1 text-sm ${
            direction === 'backward'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
          onClick={() => setDirection('backward')}
          disabled={pending}
        >
          {t('directionBackward')}
        </button>
      </div>

      {plan && (
        <ul className="space-y-1 text-sm">
          <li className="font-medium">
            {t('candidateRowLabel')}{' '}
            <code className="text-xs font-normal">
              {formatRange(candidate.startedAt, candidate.endedAt)} →{' '}
              {formatRange(plan.candidateAfter.startedAt, plan.candidateAfter.endedAt)}
            </code>
          </li>
          {plan.shifts.map((s) => (
            <li key={s.entryId} className="text-zinc-600 dark:text-zinc-400">
              <code className="text-xs">
                {formatRange(s.before.startedAt, s.before.endedAt)} →{' '}
                {formatRange(s.after.startedAt, s.after.endedAt)}
              </code>
            </li>
          ))}
        </ul>
      )}

      {isBackwardDegenerate && (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{t('degeneracyNote')}</p>
      )}

      {error === 'cascade_window_exceeded' && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t('errorCascadeWindow')}</p>
      )}

      <button
        type="button"
        className="mt-4 text-sm underline disabled:opacity-50"
        onClick={() => {
          startTransition(async () => {
            await onSaveWithoutShift();
            onClose();
          });
        }}
        disabled={pending}
      >
        {t('saveWithoutShift')}
      </button>
    </ConfirmModal>
  );
}
