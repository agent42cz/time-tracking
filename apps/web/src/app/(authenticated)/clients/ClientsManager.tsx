'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Badge, Button, ConfirmModal, Field, FieldGroup, Input } from '@tt/ui';
import {
  archiveClientAction,
  archiveProjectAction,
  createClientAction,
  createProjectAction,
  deleteClientAction,
  deleteProjectAction,
} from '@/lib/actions/catalog';

interface Project {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
}
interface Client {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
  projects: Project[];
}

type PendingAction =
  | { kind: 'archive-client'; client: Client }
  | { kind: 'delete-client'; client: Client }
  | { kind: 'archive-project'; project: Project }
  | { kind: 'delete-project'; project: Project };

export function ClientsManager({ clients }: { clients: Client[] }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [cascade, setCascade] = useState(false);

  function close(): void {
    setAction(null);
    setCascade(false);
  }

  function confirmAction(): void {
    if (!action) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await runAction(action, cascade);
        if (!r.ok) setError(r.error);
      } catch {
        setError('Akce se nezdařila — zkuste to znovu');
      } finally {
        close();
      }
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const r = await createClientAction(fd);
            if (!r.ok) setError(r.error);
            else (e.target as HTMLFormElement).reset();
          });
        }}
      >
        <FieldGroup>
          <Field label="Nový klient" htmlFor="new-client">
            <div className="flex gap-2">
              <Input id="new-client" name="name" placeholder="Název klienta" required />
              <Button type="submit" loading={pending}>
                Přidat
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>

      <ul className="divide-y divide-zinc-100">
        {clients.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-zinc-400 hover:text-zinc-700"
                  onClick={() => setOpenClient(openClient === c.id ? null : c.id)}
                  aria-label="Rozbalit projekty"
                >
                  {openClient === c.id ? '▾' : '▸'}
                </button>
                <span className={`font-medium ${c.archived ? 'text-zinc-400' : 'text-zinc-900'}`}>
                  {c.name}
                </span>
                {c.archived ? <Badge tone="warning">archivováno</Badge> : null}
                <span className="text-xs text-zinc-500">
                  ({c.projects.length} projektů, {c.entryCount} záznamů)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAction({ kind: 'archive-client', client: c })}
                >
                  {c.archived ? 'Obnovit' : 'Archivovat'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setAction({ kind: 'delete-client', client: c })}
                >
                  Smazat
                </Button>
              </div>
            </div>

            {openClient === c.id ? (
              <div className="mt-3 ml-7 space-y-3 border-l border-zinc-100 pl-4">
                <ul className="space-y-1.5">
                  {c.projects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={p.archived ? 'text-zinc-400' : 'text-zinc-800'}>
                          {p.name}
                        </span>
                        {p.archived ? <Badge tone="warning">archivováno</Badge> : null}
                        <span className="text-xs text-zinc-500">({p.entryCount} záznamů)</span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAction({ kind: 'archive-project', project: p })}
                        >
                          {p.archived ? 'Obnovit' : 'Archivovat'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAction({ kind: 'delete-project', project: p })}
                          aria-label="Smazat projekt"
                        >
                          ✕
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set('clientId', c.id);
                    setError(null);
                    startTransition(async () => {
                      const r = await createProjectAction(fd);
                      if (!r.ok) setError(r.error);
                      else (e.target as HTMLFormElement).reset();
                    });
                  }}
                  className="flex gap-2"
                >
                  <Input name="name" placeholder="Nový projekt" />
                  <Button type="submit" size="sm" loading={pending}>
                    Přidat projekt
                  </Button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={action !== null}
        title={action ? actionTitle(action) : ''}
        description={action ? actionDescription(action) : null}
        confirmLabel={action ? actionConfirmLabel(action) : 'Potvrdit'}
        tone={action && action.kind.startsWith('delete-') ? 'danger' : 'default'}
        loading={pending}
        onCancel={close}
        onConfirm={confirmAction}
      >
        {action && action.kind === 'delete-client' && action.client.entryCount > 0 ? (
          <CascadeChoice
            value={cascade}
            onChange={setCascade}
            label={`Smazat i ${action.client.entryCount} časových záznamů (jinak zůstanou bez klienta)`}
          />
        ) : null}
        {action && action.kind === 'delete-project' && action.project.entryCount > 0 ? (
          <CascadeChoice
            value={cascade}
            onChange={setCascade}
            label={`Smazat i ${action.project.entryCount} časových záznamů (jinak zůstanou bez projektu)`}
          />
        ) : null}
      </ConfirmModal>
    </div>
  );
}

function CascadeChoice({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): ReactElement {
  return (
    <label className="flex items-start gap-2 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>{label}</span>
    </label>
  );
}

function actionTitle(a: PendingAction): string {
  switch (a.kind) {
    case 'archive-client':
      return a.client.archived ? 'Obnovit klienta' : 'Archivovat klienta';
    case 'archive-project':
      return a.project.archived ? 'Obnovit projekt' : 'Archivovat projekt';
    case 'delete-client':
      return 'Smazat klienta';
    case 'delete-project':
      return 'Smazat projekt';
  }
}

function actionDescription(a: PendingAction): string {
  switch (a.kind) {
    case 'archive-client':
      return a.client.archived
        ? `Klient „${a.client.name}" se znovu zobrazí v nabídkách.`
        : `Klient „${a.client.name}" zmizí z nabídek, ale historie záznamů zůstane.`;
    case 'archive-project':
      return a.project.archived
        ? `Projekt „${a.project.name}" se znovu zobrazí v nabídkách.`
        : `Projekt „${a.project.name}" zmizí z nabídek, ale historie záznamů zůstane.`;
    case 'delete-client':
      return `Opravdu smazat klienta „${a.client.name}"? Tato akce je nevratná.`;
    case 'delete-project':
      return `Opravdu smazat projekt „${a.project.name}"? Tato akce je nevratná.`;
  }
}

function actionConfirmLabel(a: PendingAction): string {
  switch (a.kind) {
    case 'archive-client':
      return a.client.archived ? 'Obnovit' : 'Archivovat';
    case 'archive-project':
      return a.project.archived ? 'Obnovit' : 'Archivovat';
    case 'delete-client':
    case 'delete-project':
      return 'Smazat';
  }
}

async function runAction(
  a: PendingAction,
  cascade: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (a.kind) {
    case 'archive-client':
      return archiveClientAction(a.client.id, !a.client.archived);
    case 'archive-project':
      return archiveProjectAction(a.project.id, !a.project.archived);
    case 'delete-client':
      return deleteClientAction(a.client.id, cascade);
    case 'delete-project':
      return deleteProjectAction(a.project.id, cascade);
  }
}
