import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

export function Card(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
        props.className,
      )}
    />
  );
}

export function CardHeader({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...rest}
      className={cn(
        'flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <h2
      className={cn(
        'text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100',
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function CardBody(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div {...props} className={cn('px-5 py-4', props.className)} />;
}

export function CardFooter(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/40',
        props.className,
      )}
    />
  );
}
