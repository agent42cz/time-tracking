'use client';

import type { ReactElement } from 'react';
import { useEffect, useMemo, useState, useTransition } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { Alert, Button, ConfirmModal, Field, FieldGroup, Input, SearchInput } from '@tt/ui';
import {
  archiveClientAction,
  archiveProjectAction,
  createClientAction,
  createProjectAction,
  deleteClientAction,
  deleteProjectAction,
  reorderClientsAction,
} from '@/lib/actions/catalog';
import { ClientRow, type ClientRowItem } from './ClientRow';
import type { ProjectRowItem } from './ProjectRow';
import { filterClients } from './filterClients';

type PendingAction =
  | { kind: 'archive-client'; client: ClientRowItem }
  | { kind: 'delete-client'; client: ClientRowItem }
  | { kind: 'archive-project'; project: ProjectRowItem }
  | { kind: 'delete-project'; project: ProjectRowItem };

export function ClientsManager({ clients }: { clients: ClientRowItem[] }): ReactElement {
  const tSearch = useTranslations('clients.search');
  const tList = useTranslations('clients');
  const tDnd = useTranslations('clients.dnd');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [cascade, setCascade] = useState(false);
  const [query, setQuery] = useState('');
  const [orderedClients, setOrderedClients] = useState<ClientRowItem[]>(clients);

  useEffect(() => {
    setOrderedClients(clients);
  }, [clients]);

  const { visible, autoExpanded } = useMemo(
    () => filterClients(orderedClients, query),
    [orderedClients, query],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragDisabled = query.length > 0;

  async function handleClientDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeClients = orderedClients.filter((c) => !c.archived);
    const archivedClients = orderedClients.filter((c) => c.archived);
    const oldIndex = activeClients.findIndex((c) => c.id === active.id);
    const newIndex = activeClients.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const snapshot = orderedClients;
    const reordered = arrayMove(activeClients, oldIndex, newIndex);
    setOrderedClients([...reordered, ...archivedClients]);
    setError(null);

    const r = await reorderClientsAction(reordered.map((c) => c.id));
    if (!r.ok) {
      setOrderedClients(snapshot);
      setError(r.error);
    }
  }

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{tList('title')}</h2>
        <div className="w-full sm:w-72">
          <SearchInput
            value={query}
            onChange={setQuery}
            ariaLabel={tSearch('ariaLabel')}
            clearAriaLabel={tSearch('clearAriaLabel')}
            placeholder={tSearch('placeholder')}
          />
        </div>
      </div>

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

      {dragDisabled ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{tSearch('disabledDrag')}</p>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{tSearch('empty')}</p>
      ) : (
        (() => {
          const activeVisible = visible.filter((c) => !c.archived);
          const archivedVisible = visible.filter((c) => c.archived);
          const renderRow = (c: ClientRowItem, draggable: boolean): ReactElement => (
            <ClientRow
              key={c.id}
              client={c}
              isOpen={autoExpanded.has(c.id) || openClient === c.id}
              pending={pending}
              draggable={draggable}
              onToggle={() => setOpenClient(openClient === c.id ? null : c.id)}
              onArchiveClient={() => setAction({ kind: 'archive-client', client: c })}
              onDeleteClient={() => setAction({ kind: 'delete-client', client: c })}
              onArchiveProject={(p) => setAction({ kind: 'archive-project', project: p })}
              onDeleteProject={(p) => setAction({ kind: 'delete-project', project: p })}
              onAddProject={(e) => {
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
            />
          );
          return (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={dragDisabled ? undefined : handleClientDragEnd}
                accessibility={{
                  screenReaderInstructions: { draggable: tDnd('instructions') },
                }}
              >
                <SortableContext
                  items={activeVisible.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {activeVisible.map((c) => renderRow(c, !dragDisabled))}
                  </ul>
                </SortableContext>
              </DndContext>
              {archivedVisible.length > 0 ? (
                <>
                  <hr className="border-zinc-100 dark:border-zinc-800/60" />
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {archivedVisible.map((c) => renderRow(c, false))}
                  </ul>
                </>
              ) : null}
            </>
          );
        })()
      )}

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
    <label className="flex items-start gap-2 rounded-md bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
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
