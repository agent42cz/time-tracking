import type { ReactElement } from 'react';
import { useState } from 'react';
import type { CatalogResponse } from './api.js';
import { useBodyScrollLock } from './useBodyScrollLock.js';

export interface NewProjectSheetProps {
  catalog: CatalogResponse;
  onClose: () => void;
  onCreate: (clientId: string, name: string) => Promise<{ id: string }>;
}

export function NewProjectSheet({
  catalog,
  onClose,
  onCreate,
}: NewProjectSheetProps): ReactElement {
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!clientId || !trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onCreate(clientId, trimmed);
      onClose();
    } catch {
      setError('Projekt se nepodařilo vytvořit');
      setPending(false);
    }
  }

  useBodyScrollLock();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-sheet-title"
      className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700/60">
        <span
          id="new-project-sheet-title"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Nový projekt
        </span>
        <button
          type="button"
          onClick={onClose}
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
            Klient
          </span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">— klient —</option>
            {catalog.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Název projektu
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Název projektu"
            className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !clientId || !name.trim()}
          className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          {pending ? 'Vytvářím…' : 'Vytvořit'}
        </button>
      </div>
    </div>
  );
}
