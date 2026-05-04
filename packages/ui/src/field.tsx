import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldGroup(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div {...props} className={cn('space-y-4', props.className)} />;
}
