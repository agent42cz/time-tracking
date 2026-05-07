'use client';

import type { ReactElement } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { Badge, Button } from '@tt/ui';

export interface ProjectRowItem {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
}

export interface ProjectRowProps {
  project: ProjectRowItem;
  draggable: boolean;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectRow({
  project,
  draggable,
  onArchive,
  onDelete,
}: ProjectRowProps): ReactElement {
  const t = useTranslations('clients.dnd');
  const sortable = useSortable({ id: project.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 text-sm"
    >
      <div className="flex items-center gap-2">
        {draggable ? (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.listeners}
            {...sortable.attributes}
            aria-label={t('dragHandle')}
            className="cursor-grab text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            ⋮⋮
          </button>
        ) : null}
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
