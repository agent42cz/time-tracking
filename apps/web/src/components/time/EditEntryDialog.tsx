'use client';

import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConfirmModal, Field, Input, Select } from '@tt/ui';
import { getEntryEditContextAction, updateEntryAction } from '@/lib/actions/time';
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

interface ClientWithProjects {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}
interface Tag {
  id: string;
  name: string;
  color: string;
}

interface EntryPatch {
  description: string;
  clientId: string | null;
  projectId: string | null;
  tagIds: string[];
  startedAt: string;
  endedAt?: string | null;
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
  const router = useRouter();
  // Start/end stay initialized synchronously from `initial` so the e2e that
  // reads #edit-entry-start right after opening keeps working.
  const [start, setStart] = useState<string>(() => isoToLocalInput(initial.startedAt));
  const [end, setEnd] = useState<string>(() =>
    initial.endedAt ? isoToLocalInput(initial.endedAt) : '',
  );
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientWithProjects[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoStackOpen, setAutoStackOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<
    AutoStackActionInput['candidate'] | null
  >(null);
  const [pendingPatch, setPendingPatch] = useState<EntryPatch | null>(null);

  const wasRunning = initial.endedAt === null;
  const duration = useMemo(
    () => (end ? fmtDuration(localInputToIso(start), localInputToIso(end)) : ''),
    [start, end],
  );

  const projects = useMemo(
    () => clients.find((c) => c.id === clientId)?.projects ?? [],
    [clients, clientId],
  );

  // Load the catalog + the entry's current description/client/project/tags when
  // the dialog opens. Start/end are NOT touched here — they stay synchronous.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingContext(true);
    setError(null);
    void getEntryEditContextAction(entryId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setDescription(r.data.entry.description);
        setClientId(r.data.entry.clientId ?? '');
        setProjectId(r.data.entry.projectId ?? '');
        setTagIds(r.data.entry.tagIds);
        setClients(r.data.clients);
        setTags(r.data.tags);
      } else {
        setError(r.error);
      }
      setLoadingContext(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, entryId]);

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildPatch(startIso: string, endIso: string | null): EntryPatch {
    const patch: EntryPatch = {
      description,
      clientId: clientId || null,
      projectId: projectId || null,
      tagIds,
      startedAt: startIso,
    };
    // Only include endedAt when the user filled it in (running timers stay running).
    if (end) patch.endedAt = endIso;
    return patch;
  }

  async function doDirectSave(
    patch: EntryPatch,
    startIso: string,
    endIso: string | null,
  ): Promise<void> {
    const r = await updateEntryAction(entryId, patch);
    if (r.ok) {
      onSaved({ startedAt: startIso, endedAt: end ? endIso : null });
      // Refresh server-rendered lists so description/client/project/tag changes
      // are reflected on the timer running rows, history, and reports.
      router.refresh();
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
      const patch = buildPatch(startIso, endIso);

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
          <Field label={t('description')} htmlFor="edit-entry-description">
            <Input
              id="edit-entry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              disabled={loadingContext}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('client')} htmlFor="edit-entry-client">
              <Select
                id="edit-entry-client"
                value={clientId}
                disabled={loadingContext}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setProjectId('');
                }}
              >
                <option value="">{t('noClient')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('project')} htmlFor="edit-entry-project">
              <Select
                id="edit-entry-project"
                value={projectId}
                disabled={loadingContext || !clientId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t('noProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {tags.length > 0 ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('tags')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={loadingContext}
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full border px-2.5 py-1 sm:py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                      }`}
                      style={
                        active ? { backgroundColor: tag.color, borderColor: tag.color } : undefined
                      }
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
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
              router.refresh();
              onClose();
            } else {
              setError(r.error);
            }
          }}
          onShifted={async () => {
            // The shift action only persisted startedAt/endedAt; persist the
            // non-time field edits too so they aren't silently dropped. These
            // don't affect the time window, so no overlap re-check is needed.
            const r = await updateEntryAction(entryId, {
              description,
              clientId: clientId || null,
              projectId: projectId || null,
              tagIds,
            });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            onSaved({
              startedAt: pendingCandidate.startedAt,
              endedAt: pendingCandidate.endedAt,
            });
            router.refresh();
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
