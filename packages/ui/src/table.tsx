import type { HTMLAttributes, ReactElement, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from './cn.js';

export function Table(props: HTMLAttributes<HTMLTableElement>): ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <table {...props} className={cn('w-full text-sm', props.className)} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return <thead {...props} className={cn('bg-zinc-50/60', props.className)} />;
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return (
    <th
      {...props}
      className={cn(
        'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500',
        props.className,
      )}
    />
  );
}

export function Tr(props: HTMLAttributes<HTMLTableRowElement>): ReactElement {
  return (
    <tr
      {...props}
      className={cn('border-t border-zinc-100 hover:bg-zinc-50/50', props.className)}
    />
  );
}

export function Td(props: TdHTMLAttributes<HTMLTableCellElement>): ReactElement {
  return <td {...props} className={cn('px-4 py-2.5 align-middle text-zinc-800', props.className)} />;
}
