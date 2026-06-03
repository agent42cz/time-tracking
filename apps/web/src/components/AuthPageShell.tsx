import type { ReactElement, ReactNode } from 'react';

/** Centered, responsively-padded wrapper for public/auth pages. */
export function AuthPageShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-4 sm:py-8 md:py-12 dark:bg-zinc-900">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
