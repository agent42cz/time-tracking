'use client';

import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Optional secondary text — shown muted next to the label. */
  hint?: string;
  /** Optional color swatch (e.g. for tags). */
  color?: string;
}

export interface MultiSelectProps {
  /** Hidden-input name; one input per selected id is rendered for form submit. */
  name: string;
  options: MultiSelectOption[];
  defaultValues?: string[];
  placeholder?: string;
  /** Optional one-letter prefix shown before option labels (decorative). */
  emptyLabel?: string;
}

/**
 * Chip-based multi-select with search + checkboxes.
 * Renders hidden inputs so it works inside an HTML form (method=GET).
 */
export function MultiSelect({
  name,
  options,
  defaultValues = [],
  placeholder = 'Vyberte…',
  emptyLabel = 'Vše',
}: MultiSelectProps): ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabels = useMemo(
    () => options.filter((o) => selected.has(o.id)),
    [options, selected],
  );

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearAll(): void {
    setSelected(new Set());
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden inputs for form submit */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[38px] items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-left text-sm text-zinc-900 hover:bg-zinc-50 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        aria-expanded={open}
      >
        {selectedLabels.length === 0 ? (
          <span className="px-1 text-zinc-400">{placeholder}</span>
        ) : (
          <div className="flex flex-1 flex-wrap gap-1">
            {selectedLabels.slice(0, 4).map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800"
                style={o.color ? { backgroundColor: o.color, color: '#fff' } : undefined}
              >
                {o.label}
                <button
                  type="button"
                  aria-label={`Odebrat ${o.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.id);
                  }}
                  className="text-current opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
            {selectedLabels.length > 4 ? (
              <span className="self-center px-1 text-xs text-zinc-500">
                +{selectedLabels.length - 4}
              </span>
            ) : null}
          </div>
        )}
        <span aria-hidden className="ml-auto text-zinc-400">
          ▾
        </span>
      </button>

      {/* Popover */}
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-2 py-1.5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat…"
              className="flex-1 bg-transparent py-1 text-sm placeholder:text-zinc-400 focus:outline-none"
            />
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-100"
              >
                Vyčistit
              </button>
            ) : null}
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-400">{emptyLabel}</li>
            ) : null}
            {filtered.map((o) => {
              const checked = selected.has(o.id);
              return (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    {o.color ? (
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: o.color }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="text-zinc-900">{o.label}</span>
                    {o.hint ? <span className="ml-auto text-xs text-zinc-500">{o.hint}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          {selected.size > 0 ? (
            <div className="border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-500">
              Vybráno: {selected.size}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
