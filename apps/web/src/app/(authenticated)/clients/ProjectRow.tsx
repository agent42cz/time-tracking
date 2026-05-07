'use client';

import type { ReactElement } from 'react';
import { Badge, Button } from '@tt/ui';

export interface ProjectRowItem {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
}

export interface ProjectRowProps {
  project: ProjectRowItem;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectRow({ project, onArchive, onDelete }: ProjectRowProps): ReactElement {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={
            project.archived
              ? 'text-zinc-400 dark:text-zinc-500'
              : 'text-zinc-800 dark:text-zinc-200'
          }
        >
          {project.name}
        </span>
        {project.archived ? <Badge tone="warning">archivováno</Badge> : null}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          ({project.entryCount} záznamů)
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={onArchive}>
          {project.archived ? 'Obnovit' : 'Archivovat'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Smazat projekt">
          ✕
        </Button>
      </div>
    </li>
  );
}
