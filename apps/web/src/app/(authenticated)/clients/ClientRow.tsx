'use client';

import type { FormEvent, ReactElement } from 'react';
import { Badge, Button, Input } from '@tt/ui';
import { ProjectRow, type ProjectRowItem } from './ProjectRow';

export interface ClientRowItem {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
  projects: ProjectRowItem[];
}

export interface ClientRowProps {
  client: ClientRowItem;
  isOpen: boolean;
  pending: boolean;
  onToggle: () => void;
  onArchiveClient: () => void;
  onDeleteClient: () => void;
  onArchiveProject: (project: ProjectRowItem) => void;
  onDeleteProject: (project: ProjectRowItem) => void;
  onAddProject: (e: FormEvent<HTMLFormElement>) => void;
}

export function ClientRow({
  client,
  isOpen,
  pending,
  onToggle,
  onArchiveClient,
  onDeleteClient,
  onArchiveProject,
  onDeleteProject,
  onAddProject,
}: ClientRowProps): ReactElement {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={onToggle}
            aria-label="Rozbalit projekty"
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <span
            className={`font-medium ${
              client.archived
                ? 'text-zinc-400 dark:text-zinc-500'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {client.name}
          </span>
          {client.archived ? <Badge tone="warning">archivováno</Badge> : null}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ({client.projects.length} projektů, {client.entryCount} záznamů)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onArchiveClient}>
            {client.archived ? 'Obnovit' : 'Archivovat'}
          </Button>
          <Button size="sm" variant="danger" onClick={onDeleteClient}>
            Smazat
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 ml-7 space-y-3 border-l border-zinc-100 dark:border-zinc-800/60 pl-4">
          <ul className="space-y-1.5">
            {client.projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onArchive={() => onArchiveProject(p)}
                onDelete={() => onDeleteProject(p)}
              />
            ))}
          </ul>
          <form onSubmit={onAddProject} className="flex gap-2">
            <Input name="name" placeholder="Nový projekt" />
            <Button type="submit" size="sm" loading={pending}>
              Přidat projekt
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
