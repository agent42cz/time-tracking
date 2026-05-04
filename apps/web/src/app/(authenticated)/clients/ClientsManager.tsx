'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Badge, Button, Field, FieldGroup, Input } from '@tt/ui';
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

export function ClientsManager({ clients }: { clients: Client[] }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openClient, setOpenClient] = useState<string | null>(null);

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
                  loading={pending}
                  onClick={() =>
                    startTransition(() =>
                      archiveClientAction(c.id, !c.archived).then((r) => {
                        if (!r.ok) setError(r.error);
                      }),
                    )
                  }
                >
                  {c.archived ? 'Obnovit' : 'Archivovat'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={pending}
                  onClick={() => {
                    if (c.entryCount > 0) {
                      const cascade = confirm(
                        `Klient má ${c.entryCount} časových záznamů. Smazat i tyto záznamy?\n\nOK = smazat všechny, Storno = zachovat (záznamy se objeví bez klienta)`,
                      );
                      startTransition(() =>
                        deleteClientAction(c.id, cascade).then((r) => {
                          if (!r.ok) setError(r.error);
                        }),
                      );
                    } else {
                      startTransition(() =>
                        deleteClientAction(c.id, false).then((r) => {
                          if (!r.ok) setError(r.error);
                        }),
                      );
                    }
                  }}
                >
                  Smazat
                </Button>
              </div>
            </div>

            {openClient === c.id ? (
              <div className="mt-3 ml-7 space-y-3 border-l border-zinc-100 pl-4">
                <ul className="space-y-1.5">
                  {c.projects.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            p.archived ? 'text-zinc-400' : 'text-zinc-800'
                          }
                        >
                          {p.name}
                        </span>
                        {p.archived ? <Badge tone="warning">archivováno</Badge> : null}
                        <span className="text-xs text-zinc-500">
                          ({p.entryCount} záznamů)
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending}
                          onClick={() =>
                            startTransition(() =>
                              archiveProjectAction(p.id, !p.archived).then((r) => {
                                if (!r.ok) setError(r.error);
                              }),
                            )
                          }
                        >
                          {p.archived ? 'Obnovit' : 'Archivovat'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending}
                          onClick={() => {
                            const cascade =
                              p.entryCount > 0
                                ? confirm(
                                    `Projekt má ${p.entryCount} záznamů. Smazat i tyto záznamy?`,
                                  )
                                : false;
                            startTransition(() =>
                              deleteProjectAction(p.id, cascade).then((r) => {
                                if (!r.ok) setError(r.error);
                              }),
                            );
                          }}
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
    </div>
  );
}
