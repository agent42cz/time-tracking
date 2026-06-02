import type { ReactElement, ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}): ReactElement {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
