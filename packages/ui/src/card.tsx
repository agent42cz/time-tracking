import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from './cn.js';

export function Card(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800',
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
        'flex flex-col items-start gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4 dark:border-zinc-700/60',
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
  return <div {...props} className={cn('px-4 py-3 sm:px-5 sm:py-4', props.className)} />;
}

export function CardFooter(props: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 dark:border-zinc-700/60 dark:bg-zinc-900/40',
        props.className,
      )}
    />
  );
}
