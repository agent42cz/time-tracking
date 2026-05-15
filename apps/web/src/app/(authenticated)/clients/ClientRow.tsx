'use client';

import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from 'next-intl';
import { Alert, Badge, Button, Input } from '@tt/ui';
import { renameClientAction, reorderProjectsAction } from '@/lib/actions/catalog';
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
  draggable: boolean;
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
  draggable,
  onToggle,
  onArchiveClient,
  onDeleteClient,
  onArchiveProject,
  onDeleteProject,
  onAddProject,
}: ClientRowProps): ReactElement {
  const t = useTranslations('clients.dnd');
  const sortable = useSortable({ id: client.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [projectsMirror, setProjectsMirror] = useState<ProjectRowItem[]>(client.projects);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(client.name);
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRenaming) setRenameValue(client.name);
  }, [client.name, isRenaming]);

  async function submitRename(): Promise<void> {
    const next = renameValue.trim();
    if (!next || next === client.name) {
      setIsRenaming(false);
      setRenameError(null);
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    const r = await renameClientAction(client.id, next);
    setRenamePending(false);
    if (!r.ok) {
      setRenameError(r.error);
      return;
    }
    setIsRenaming(false);
  }

  useEffect(() => {
    setProjectsMirror(client.projects);
  }, [client.projects]);

  const activeProjects = projectsMirror.filter((p) => !p.archived);
  const archivedProjects = projectsMirror.filter((p) => p.archived);

  async function handleProjectDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeProjects.findIndex((p) => p.id === active.id);
    const newIndex = activeProjects.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const snapshot = projectsMirror;
    const reordered = arrayMove(activeProjects, oldIndex, newIndex);
    setProjectsMirror([...reordered, ...archivedProjects]);
    setProjectError(null);

    const r = await reorderProjectsAction(
      client.id,
      reordered.map((p) => p.id),
    );
    if (!r.ok) {
      setProjectsMirror(snapshot);
      setProjectError(r.error);
    }
  }

  return (
    <li ref={sortable.setNodeRef} style={style} className="py-3">
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
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center text-xl leading-none text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={onToggle}
            aria-label="Rozbalit projekty"
          >
            {isOpen ? '▾' : '▸'}
          </button>
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
                className={`font-medium ${
                  client.archived
                    ? 'text-zinc-400 dark:text-zinc-500'
                    : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {client.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRenameValue(client.name);
                  setIsRenaming(true);
                }}
                aria-label="Přejmenovat klienta"
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ✎
              </button>
              {client.archived ? <Badge tone="warning">archivováno</Badge> : null}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                ({client.projects.length} projektů, {client.entryCount} záznamů)
              </span>
            </>
          )}
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
      {renameError ? (
        <div className="mt-2 ml-7">
          <Alert tone="danger">{renameError}</Alert>
        </div>
      ) : null}

      {isOpen ? (
        <div className="mt-3 ml-7 space-y-3 border-l border-zinc-100 dark:border-zinc-700/60 pl-4">
          {projectError ? <Alert tone="danger">{projectError}</Alert> : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={draggable ? handleProjectDragEnd : undefined}
            accessibility={{
              screenReaderInstructions: { draggable: t('instructions') },
            }}
          >
            <SortableContext
              items={activeProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-1.5">
                {activeProjects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    draggable={draggable}
                    onArchive={() => onArchiveProject(p)}
                    onDelete={() => onDeleteProject(p)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {archivedProjects.length > 0 ? (
            <ul className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-700/60">
              {archivedProjects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  draggable={false}
                  onArchive={() => onArchiveProject(p)}
                  onDelete={() => onDeleteProject(p)}
                />
              ))}
            </ul>
          ) : null}
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
