import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import type { CatalogResponse, ManualEntryApiInput, UpdateEntryPatch } from './api.js';
import { fromLocalInput, toLocalInput } from './datetime.js';

export interface EntrySheetInitial {
  id: string;
  description: string;
  clientId: string | null;
  projectId: string | null;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, or null while running
  tagIds: string[];
}

export interface EntrySheetProps {
  mode: 'edit' | 'create';
  catalog: CatalogResponse;
  isAdmin: boolean;
  nowIso: string;
  initial?: EntrySheetInitial;
  onClose: () => void;
  onSave: (entryId: string, patch: UpdateEntryPatch) => Promise<void>;
  onCreate: (input: ManualEntryApiInput) => Promise<void>;
  onCreateProject: (clientId: string, name: string) => Promise<{ id: string }>;
}

export function EntrySheet(props: EntrySheetProps): ReactElement {
  const { mode, catalog, isAdmin, initial } = props;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [start, setStart] = useState(toLocalInput(initial?.startedAt ?? props.nowIso));
  const [end, setEnd] = useState(initial?.endedAt ? toLocalInput(initial.endedAt) : '');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasRunning = mode === 'edit' && initial?.endedAt == null;
  const projects = useMemo(
    () => catalog.clients.find((c) => c.id === clientId)?.projects ?? [],
    [catalog.clients, clientId],
  );

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function addProject(): Promise<void> {
    const name = newProjectName.trim();
    if (!clientId || !name) return;
    try {
      const created = await props.onCreateProject(clientId, name);
      setProjectId(created.id);
      setCreatingProject(false);
      setNewProjectName('');
    } catch {
      setError('Projekt se nepodařilo vytvořit');
    }
  }

  async function submit(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      if (mode === 'create') {
        if (!end) {
          setError('Vyplňte konec');
          setPending(false);
          return;
        }
        await props.onCreate({
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: fromLocalInput(start),
          endedAt: fromLocalInput(end),
          tagIds,
        });
      } else if (initial) {
        const patch: UpdateEntryPatch = {
          description,
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: fromLocalInput(start),
          tagIds,
        };
        if (!wasRunning || end) patch.endedAt = end ? fromLocalInput(end) : null;
        await props.onSave(initial.id, patch);
      }
      props.onClose();
    } catch {
      setError('Uložení se nezdařilo');
      setPending(false);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-700/60">
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
      <div className="space-y-2 overflow-y-auto p-3">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Co děláte?"
          className="block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId('');
              setCreatingProject(false);
            }}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            <option value="">— projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && clientId ? (
          creatingProject ? (
            <div className="flex gap-1">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Název projektu"
                className="block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => void addProject()}
                className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Přidat
              </button>
              <button
                type="button"
                onClick={() => setCreatingProject(false)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              + Nový projekt
            </button>
          )
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Začátek
            </span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Konec
            </span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>
        </div>
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
