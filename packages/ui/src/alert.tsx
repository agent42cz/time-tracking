import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './cn.js';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

export function Alert({
  tone = 'info',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }): ReactElement {
  return (
    <div
      role="alert"
      {...rest}
      className={cn('rounded-md border px-3 py-2 text-sm', tones[tone], className)}
    />
  );
}
