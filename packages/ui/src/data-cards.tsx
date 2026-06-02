import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

/** Bordered card used as the mobile (below-md) stand-in for a table row. */
export function DataCard(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800',
        props.className,
      )}
    />
  );
}

/** A label–value line inside a DataCard. */
export function DataCardRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-zinc-800 dark:text-zinc-200">
        {children}
      </span>
    </div>
  );
}

/** Footer row for the card's action buttons. */
export function DataCardActions(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-700/60',
        props.className,
      )}
    />
  );
}
