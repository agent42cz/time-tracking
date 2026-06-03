import type { HTMLAttributes, ReactElement, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from './cn.js';

export function Table(props: HTMLAttributes<HTMLTableElement>): ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
      <table {...props} className={cn('w-full text-sm', props.className)} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return <thead {...props} className={cn('bg-zinc-50/60 dark:bg-zinc-900/40', props.className)} />;
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return (
    <th
      {...props}
      className={cn(
        'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
        props.className,
      )}
    />
  );
}

export function Tr(props: HTMLAttributes<HTMLTableRowElement>): ReactElement {
  return (
    <tr
      {...props}
      className={cn(
        'border-t border-zinc-100 hover:bg-zinc-50/50 dark:border-zinc-700/60 dark:hover:bg-zinc-950/40',
        props.className,
      )}
    />
  );
}

export function Td(props: TdHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return (
    <td
      {...props}
      className={cn('px-4 py-2.5 align-middle text-zinc-800 dark:text-zinc-200', props.className)}
    />
  );
}
