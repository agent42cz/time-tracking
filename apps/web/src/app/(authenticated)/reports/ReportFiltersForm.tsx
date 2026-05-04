'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Field } from '@tt/ui';
import { MultiSelect } from '@/components/MultiSelect';

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
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type PresetKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

function preset(kind: PresetKey): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  switch (kind) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'thisWeek': {
      const dow = (start.getDay() + 6) % 7; // Mon=0..Sun=6
      start.setDate(start.getDate() - dow);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'lastWeek': {
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow - 7);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'thisMonth':
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end.setMonth(start.getMonth() + 1, 0);
      break;
  }
  return { from: ymdLocal(start), to: ymdLocal(end) };
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Dnes' },
  { key: 'yesterday', label: 'Včera' },
  { key: 'thisWeek', label: 'Tento týden' },
  { key: 'lastWeek', label: 'Minulý týden' },
  { key: 'thisMonth', label: 'Tento měsíc' },
  { key: 'lastMonth', label: 'Minulý měsíc' },
];

interface Props {
  isAdmin: boolean;
  clients: Option[];
  projects: Option[];
  members: Option[];
  tags: { id: string; name: string; color: string }[];
  initial: Initial;
}

export function ReportFiltersForm({
  isAdmin,
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

  const activePreset = ((): string | null => {
    if (!from || !to) return null;
    for (const { key, label } of PRESETS) {
      const r = preset(key);
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
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Období</p>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = activePreset === p.label;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  const r = preset(p.key);
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="ml-2 text-xs text-zinc-400">nebo vlastní:</span>
          <input
            type="date"
            name="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
          <span className="text-zinc-400">–</span>
          <input
            type="date"
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border border-zinc-200 px-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
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
        {isAdmin ? (
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
          <div className="flex items-center justify-between">
            <span className="block text-sm font-medium text-zinc-700">Štítky</span>
            <span className="inline-flex overflow-hidden rounded-full border border-zinc-200 text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setTagsMode('or')}
                className={`px-2 py-0.5 ${
                  tagsMode === 'or' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                Aspoň jeden
              </button>
              <button
                type="button"
                onClick={() => setTagsMode('and')}
                className={`px-2 py-0.5 ${
                  tagsMode === 'and' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
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
          className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
      </Field>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
        <p className="text-xs text-zinc-500">
          {totalSelected === 0
            ? 'Žádné aktivní filtry — zobrazí se všechny záznamy.'
            : `Aktivních filtrů: ${totalSelected}`}
        </p>
        <div className="flex items-center gap-2">
          {totalSelected > 0 ? (
            <Link
              href="/reports"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Vymazat filtry
            </Link>
          ) : null}
          <Button type="submit">Použít filtry</Button>
        </div>
      </div>
    </form>
  );
}
