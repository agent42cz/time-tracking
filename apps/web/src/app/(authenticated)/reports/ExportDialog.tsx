'use client';

import { useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmModal } from '@tt/ui';
import { MultiSelect } from '@/components/MultiSelect';
import type { GroupBy } from '@/lib/services/reports';
import { PRESETS, preset } from './date-presets';
import { buildExportUrl, resolveExportGroupBy } from './export-url';

interface Member {
  id: string;
  name: string;
}

export interface ExportDialogProps {
  isAdmin: boolean;
  meId: string;
  members: Member[];
  initial: { from: string; to: string; memberIds: string[] };
}

const GROUP_KEYS: GroupBy[] = ['project', 'member', 'day'];

function triggerDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function chipClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
  }`;
}

export function ExportDialog({ isAdmin, meId, members, initial }: ExportDialogProps): ReactElement {
  const t = useTranslations('reports');
  const [open, setOpen] = useState(false);

  const seeded =
    initial.from && initial.to
      ? { from: initial.from, to: initial.to }
      : preset('lastMonth', new Date());
  const [from, setFrom] = useState(seeded.from);
  const [to, setTo] = useState(seeded.to);
  const [allMembers, setAllMembers] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>(
    initial.memberIds.length > 0 ? initial.memberIds : [meId],
  );
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [groupOverride, setGroupOverride] = useState<GroupBy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveGroupBy: GroupBy =
    groupOverride ?? resolveExportGroupBy(isAdmin && allMembers, isAdmin ? memberIds.length : 1);

  function handleConfirm(): void {
    if (from && to && from > to) {
      setError(t('export.invalidRange'));
      return;
    }
    triggerDownload(
      buildExportUrl({
        format,
        from,
        to,
        allMembers: isAdmin && allMembers,
        memberIds: isAdmin && !allMembers ? memberIds : [],
        groupBy: effectiveGroupBy,
      }),
    );
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 sm:w-auto"
      >
        {t('export.button')}
      </button>

      <ConfirmModal
        open={open}
        title={t('export.dialogTitle')}
        confirmLabel={t('export.submit')}
        onConfirm={handleConfirm}
        onCancel={() => {
          setError(null);
          setOpen(false);
        }}
      >
        <div className="space-y-4">
          {/* Period */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.periodLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const r = preset(p.key, new Date());
                const active = from === r.from && to === r.to;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setFrom(r.from);
                      setTo(r.to);
                    }}
                    className={chipClass(active)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none sm:w-auto dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <span className="hidden text-zinc-400 sm:inline dark:text-zinc-500">–</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none sm:w-auto dark:border-zinc-700 dark:focus:border-zinc-100"
              />
            </div>
          </div>

          {/* Person — admin only */}
          {isAdmin ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('export.personLabel')}
              </p>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={allMembers}
                  onChange={(e) => setAllMembers(e.target.checked)}
                />
                {t('export.allMembers')}
              </label>
              {!allMembers ? (
                <MultiSelect
                  name="member"
                  options={members.map((m) => ({ id: m.id, label: m.name }))}
                  defaultValues={memberIds}
                  onChange={setMemberIds}
                  placeholder={t('export.personLabel')}
                />
              ) : null}
            </div>
          ) : null}

          {/* Format */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.formatLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={chipClass(format === 'pdf')}
              >
                {t('export.format.pdf')}
              </button>
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={chipClass(format === 'csv')}
              >
                {t('export.format.csv')}
              </button>
            </div>
          </div>

          {/* Grouping */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('export.groupingLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {GROUP_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupOverride(key)}
                  className={chipClass(effectiveGroupBy === key)}
                >
                  {t(`groupBy.${key}`)}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </ConfirmModal>
    </>
  );
}
