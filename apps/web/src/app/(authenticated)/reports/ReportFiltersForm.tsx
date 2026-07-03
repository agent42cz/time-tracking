'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Field } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { MultiSelect } from '@/components/MultiSelect';
import type { GroupBy } from '@/lib/services/reports';
import { PRESETS, preset } from './date-presets';

interface Option {
  id: string;
  name: string;
}

interface Initial {
  from: string;
  to: string;
  clientIds: string[];
  projectIds: string[];
  memberIds: string[];
  tagIds: string[];
  tagsMode: 'and' | 'or';
  search: string;
  groupBy: GroupBy;
}

const GROUP_KEYS = ['project', 'member', 'day'] as const;

interface Props {
  isAdmin: boolean;
  meId: string;
  clients: Option[];
  projects: Option[];
  members: Option[];
  tags: { id: string; name: string; color: string }[];
  initial: Initial;
}

export function ReportFiltersForm({
  isAdmin,
  meId,
  clients,
  projects,
  members,
  tags,
  initial,
}: Props): ReactElement {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tagsMode, setTagsMode] = useState<'and' | 'or'>(initial.tagsMode);
  const [search, setSearch] = useState(initial.search);
  const t = useTranslations('reports');
  const [groupBy, setGroupBy] = useState(initial.groupBy);
  const [onlyMine, setOnlyMine] = useState(
    initial.memberIds.length === 1 && initial.memberIds[0] === meId,
  );

  const activePreset = ((): string | null => {
    if (!from || !to) return null;
    for (const { key, label } of PRESETS) {
      const r = preset(key, new Date());
      if (r.from === from && r.to === to) return label;
    }
    return null;
  })();

  const totalSelected =
    initial.clientIds.length +
    initial.projectIds.length +
    initial.memberIds.length +
    initial.tagIds.length +
    (initial.search ? 1 : 0) +
    (initial.from || initial.to ? 1 : 0);

  return (
    <form method="get" className="space-y-5">
      {/* Date presets + custom range */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Období
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = activePreset === p.label;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  const r = preset(p.key, new Date());
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">nebo vlastní:</span>
          <input
            type="date"
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-full rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none sm:w-auto"
          />
          <span className="hidden text-zinc-400 dark:text-zinc-500 sm:inline">–</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 sm:hidden">do</span>
          <input
            type="date"
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-full rounded-md border border-zinc-200 dark:border-zinc-700 px-2 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none sm:w-auto"
          />
        </div>
      </div>

      {/* Group-by + scope */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('groupBy.label')}
          </p>
          <div className="flex flex-wrap gap-2">
            {GROUP_KEYS.map((key) => {
              const active = groupBy === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupBy(key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {t(`groupBy.${key}`)}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="groupBy" value={groupBy} />
        </div>
        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            {t('onlyMine')}
            {onlyMine ? <input type="hidden" name="member" value={meId} /> : null}
          </label>
        ) : null}
      </div>

      {/* Multi-selects */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Klienti">
          <MultiSelect
            name="client"
            options={clients.map((c) => ({ id: c.id, label: c.name }))}
            defaultValues={initial.clientIds}
            placeholder="Všichni klienti"
          />
        </Field>
        <Field label="Projekty">
          <MultiSelect
            name="project"
            options={projects.map((p) => ({ id: p.id, label: p.name }))}
            defaultValues={initial.projectIds}
            placeholder="Všechny projekty"
          />
        </Field>
        {isAdmin && !onlyMine ? (
          <Field label="Členové">
            <MultiSelect
              name="member"
              options={members.map((m) => ({ id: m.id, label: m.name }))}
              defaultValues={initial.memberIds}
              placeholder="Všichni členové"
            />
          </Field>
        ) : null}
        {/* Tags — custom header instead of <Field label> because the inline
            OR/AND toggle uses <button>s and a real <label> can't contain them. */}
        <div className="space-y-1.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Štítky
            </span>
            <span className="inline-flex overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-medium sm:text-[10px]">
              <button
                type="button"
                onClick={() => setTagsMode('or')}
                className={`px-3 py-1 sm:px-2 sm:py-0.5 ${
                  tagsMode === 'or'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Aspoň jeden
              </button>
              <button
                type="button"
                onClick={() => setTagsMode('and')}
                className={`px-3 py-1 sm:px-2 sm:py-0.5 ${
                  tagsMode === 'and'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
              >
                Všechny
              </button>
            </span>
          </div>
          <input type="hidden" name="tagsMode" value={tagsMode} />
          <MultiSelect
            name="tag"
            options={tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
            defaultValues={initial.tagIds}
            placeholder="Žádný štítek"
          />
        </div>
      </div>

      {/* Description search */}
      <Field label="Hledat v popisu" htmlFor="search">
        <input
          id="search"
          name="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="část textu z popisu záznamu…"
          className="h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-700 px-3 text-sm focus:border-zinc-900 dark:focus:border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10"
        />
      </Field>

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700/60">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {totalSelected === 0
            ? 'Žádné aktivní filtry — zobrazí se všechny záznamy.'
            : `Aktivních filtrů: ${totalSelected}`}
        </p>
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {totalSelected > 0 ? (
            <Link
              href="/reports"
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-center text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 sm:text-left"
            >
              Vymazat filtry
            </Link>
          ) : null}
          <Button type="submit" className="w-full sm:w-auto">
            Použít filtry
          </Button>
        </div>
      </div>
    </form>
  );
}
