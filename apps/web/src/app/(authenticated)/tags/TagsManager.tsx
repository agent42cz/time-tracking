'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Button, Field, FieldGroup, Input, useConfirm } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { createTagAction, deleteTagAction, updateTagAction } from '@/lib/actions/catalog';

interface Tag {
  id: string;
  name: string;
  color: string;
}

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#0ea5e9',
];

export function TagsManager({ tags, isAdmin }: { tags: Tag[]; isAdmin: boolean }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [color, setColor] = useState(PALETTE[0]!);
  const confirm = useConfirm();
  const t = useTranslations('tags.confirm');

  return (
    <div className="space-y-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set('color', color);
          setError(null);
          startTransition(async () => {
            const r = await createTagAction(fd);
            if (!r.ok) setError(r.error);
            else (e.target as HTMLFormElement).reset();
          });
        }}
      >
        <FieldGroup>
          <Field label="Nový štítek">
            <div className="flex flex-wrap items-center gap-2">
              <Input name="name" placeholder="Název" required className="max-w-xs" />
              <div className="flex gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Button type="submit" loading={pending}>
                Přidat
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>

      <ul className="flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">Žádné štítky</li>
        ) : null}
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            canEdit={isAdmin}
            onUpdate={(patch) => {
              startTransition(async () => {
                const r = await updateTagAction(tag.id, patch);
                if (!r.ok) setError(r.error);
              });
            }}
            onDelete={() => {
              void (async () => {
                const ok = await confirm({
                  title: t('deleteTitle', { name: tag.name }),
                  description: t('deleteDescription'),
                });
                if (!ok) return;
                startTransition(async () => {
                  const r = await deleteTagAction(tag.id);
                  if (!r.ok) setError(r.error);
                });
              })();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function TagChip({
  tag,
  canEdit,
  onUpdate,
  onDelete,
}: {
  tag: Tag;
  canEdit: boolean;
  onUpdate: (patch: { name?: string; color?: string }) => void;
  onDelete: () => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  if (!editing) {
    return (
      <li>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="opacity-70 hover:opacity-100"
                aria-label="upravit"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="opacity-70 hover:opacity-100"
                aria-label="smazat"
              >
                ✕
              </button>
            </>
          ) : null}
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-6 w-32 bg-transparent text-xs"
      />
      <div className="flex gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onUpdate({ color: c })}
            className="h-5 w-5 rounded-full"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        type="button"
        className="text-xs font-semibold"
        onClick={() => {
          onUpdate({ name });
          setEditing(false);
        }}
      >
        OK
      </button>
      <button type="button" className="text-xs" onClick={() => setEditing(false)}>
        ✕
      </button>
    </li>
  );
}
