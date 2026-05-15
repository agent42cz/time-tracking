'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { Alert, Badge, Button, Input } from '@tt/ui';
import { renameProjectAction } from '@/lib/actions/catalog';

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

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRenaming) setRenameValue(project.name);
  }, [project.name, isRenaming]);

  async function submitRename(): Promise<void> {
    const next = renameValue.trim();
    if (!next || next === project.name) {
      setIsRenaming(false);
      setRenameError(null);
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    const r = await renameProjectAction(project.id, next);
    setRenamePending(false);
    if (!r.ok) {
      setRenameError(r.error);
      return;
    }
    setIsRenaming(false);
  }

  return (
    <li ref={sortable.setNodeRef} style={style} className="text-sm">
      <div className="flex items-center justify-between gap-3">
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
          {isRenaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitRename();
              }}
              className="flex items-center gap-2"
            >
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsRenaming(false);
                    setRenameError(null);
                  }
                }}
                disabled={renamePending}
              />
              <Button type="submit" size="sm" loading={renamePending}>
                Uložit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsRenaming(false);
                  setRenameError(null);
                }}
              >
                Zrušit
              </Button>
            </form>
          ) : (
            <>
              <span
                className={
                  project.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-800 dark:text-zinc-200'
                }
              >
                {project.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRenameValue(project.name);
                  setIsRenaming(true);
                }}
                aria-label="Přejmenovat projekt"
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ✎
              </button>
              {project.archived ? <Badge tone="warning">archivováno</Badge> : null}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                ({project.entryCount} záznamů)
              </span>
            </>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onArchive}>
            {project.archived ? 'Obnovit' : 'Archivovat'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Smazat projekt">
            ✕
          </Button>
        </div>
      </div>
      {renameError ? (
        <div className="mt-1">
          <Alert tone="danger">{renameError}</Alert>
        </div>
      ) : null}
    </li>
  );
}
