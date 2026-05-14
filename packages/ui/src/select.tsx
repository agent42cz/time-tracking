import type { ReactElement, SelectHTMLAttributes } from 'react';
import { cn } from './cn.js';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactElement {
  return (
    <select
      {...props}
      className={cn(
        'block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900',
        'focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10',
        'dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100',
        'dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10',
        props.className,
      )}
    />
  );
}
