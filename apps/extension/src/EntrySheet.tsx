import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import {
  ApiError,
  type CatalogResponse,
  type ManualEntryApiInput,
  type UpdateEntryPatch,
} from './api.js';
import { combineToIso, resolveWindow, toDateInput, toTimeInput } from './datetime.js';
import { fmtDurationHM } from './format.js';
import { useBodyScrollLock } from './useBodyScrollLock.js';

/** Turn a failed save into a human-readable Czech reason instead of a generic message. */
function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'future_timestamp':
        return 'Čas nesmí být v budoucnosti.';
      case 'invalid_window':
        return 'Konec musí být po začátku.';
      case 'no_company':
        return 'Není vybrána firma.';
      case 'not_found':
        return 'Záznam nebyl nalezen.';
      case 'missing_window':
      case 'invalid_date':
        return 'Vyplňte platný čas.';
      default:
        return `Uložení se nezdařilo (${err.status}${err.code ? ` ${err.code}` : ''}).`;
    }
  }
  return 'Uložení se nezdařilo.';
}

export interface EntrySheetInitial {
  id: string;
  description: string;
  note: string;
  clientId: string | null;
  projectId: string | null;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, or null while running
  tagIds: string[];
}

export interface EntrySheetProps {
  mode: 'edit' | 'create';
  catalog: CatalogResponse;
  nowIso: string;
  initial?: EntrySheetInitial;
  onClose: () => void;
  onSave: (entryId: string, patch: UpdateEntryPatch) => Promise<void>;
  onCreate: (input: ManualEntryApiInput) => Promise<void>;
}

export function EntrySheet(props: EntrySheetProps): ReactElement {
  const { mode, catalog, initial } = props;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [startDate, setStartDate] = useState(toDateInput(initial?.startedAt ?? props.nowIso));
  const [startTime, setStartTime] = useState(toTimeInput(initial?.startedAt ?? props.nowIso));
  const [endTime, setEndTime] = useState(initial?.endedAt ? toTimeInput(initial.endedAt) : '');
  const [showDate, setShowDate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasRunning = mode === 'edit' && initial?.endedAt == null;
  useBodyScrollLock();

  const startIso = startTime ? combineToIso(startDate, startTime) : '';
  const win = startTime && endTime ? resolveWindow(startDate, startTime, endTime) : null;
  const endIso = win ? win.endIso : null;
  const crossesMidnight = win?.nextDay ?? false;

  const workedMs = (() => {
    if (!startIso) return 0;
    const s = new Date(startIso).getTime();
    const e = endIso ? new Date(endIso).getTime() : Date.now();
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    return Math.max(0, e - s);
  })();

  const projects = useMemo(
    () => catalog.clients.find((c) => c.id === clientId)?.projects ?? [],
    [catalog.clients, clientId],
  );

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function submit(): Promise<void> {
    setPending(true);
    setError(null);
    if (!startTime) {
      setError('Vyplňte začátek');
      setPending(false);
      return;
    }
    try {
      if (mode === 'create') {
        if (!endTime) {
          setError('Vyplňte konec');
          setPending(false);
          return;
        }
        await props.onCreate({
          description,
          note,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: startIso,
          endedAt: endIso!,
          tagIds,
        });
      } else if (initial) {
        const patch: UpdateEntryPatch = {
          description,
          note,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: startIso,
          tagIds,
        };
        if (!wasRunning || endTime) patch.endedAt = endTime ? endIso : null;
        await props.onSave(initial.id, patch);
      }
      props.onClose();
    } catch (err) {
      setError(saveErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700/60">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {mode === 'create' ? 'Nový záznam' : 'Upravit záznam'}
        </span>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Zavřít"
          className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Název
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Co děláte?"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Popis
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Detailní popis (lze upravit i přes MCP)"
            rows={3}
            className="mt-0.5 block w-full resize-y rounded border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId('');
            }}
            className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">— klient —</option>
            {catalog.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!clientId}
            className="rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            <option value="">— projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Začátek
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Konec
              {crossesMidnight ? (
                <span className="ml-1 normal-case text-zinc-400">(+1 den)</span>
              ) : null}
            </span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        </div>
        {showDate ? (
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Datum
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowDate(true)}
            className="text-[10px] font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            Změnit datum
          </button>
        )}
        {catalog.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {catalog.tags.map((t) => {
              const active = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={
                    active
                      ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                      : { borderColor: '#52525b', color: '#a1a1aa' }
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Odpracováno:{' '}
          <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
            {fmtDurationHM(workedMs)}
          </span>
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          {pending ? 'Ukládám…' : 'Uložit'}
        </button>
      </div>
    </div>
  );
}
