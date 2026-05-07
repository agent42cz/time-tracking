import type { LabelHTMLAttributes, ReactElement } from 'react';
import { cn } from './cn.js';

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>): ReactElement {
  return (
    <label
      {...props}
      className={cn('block text-sm font-medium text-zinc-700 dark:text-zinc-300', props.className)}
    />
  );
}
