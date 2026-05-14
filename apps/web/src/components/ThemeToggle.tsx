'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { applyThemeToDocument, readThemeCookie, setThemeCookie, type Theme } from '@/lib/theme';

async function persistThemeToProfile(theme: Theme): Promise<void> {
  try {
    await fetch('/api/v1/me', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch {
    // Best-effort: theme also lives in the cookie, so a network blip
    // doesn't strand the user with a wrong UI.
  }
}

async function pullThemeFromProfile(): Promise<Theme | null> {
  try {
    const res = await fetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { theme?: unknown };
    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
      return data.theme;
    }
    return null;
  } catch {
    return null;
  }
}

const FULL_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Systémový' },
  { value: 'light', label: 'Světlý' },
  { value: 'dark', label: 'Tmavý' },
];

const COMPACT_OPTIONS: { value: Theme; label: string; icon: ReactElement }[] = [
  { value: 'light', label: 'Světlý motiv', icon: <SunIcon /> },
  { value: 'dark', label: 'Tmavý motiv', icon: <MoonIcon /> },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }): ReactElement {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readThemeCookie());
    // Adopt the server-side preference if it differs from the cookie — keeps
    // the cookie around for FOUC prevention but lets the user's choice
    // follow them across browsers / the extension.
    void pullThemeFromProfile().then((serverTheme) => {
      if (!serverTheme) return;
      if (serverTheme !== readThemeCookie()) {
        setTheme(serverTheme);
        setThemeCookie(serverTheme);
        applyThemeToDocument(serverTheme);
      }
    });
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyThemeToDocument('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function pick(next: Theme): void {
    setTheme(next);
    setThemeCookie(next);
    applyThemeToDocument(next);
    void persistThemeToProfile(next);
  }

  if (compact) {
    return (
      <div
        role="group"
        aria-label="Přepnout motiv"
        className="inline-flex items-stretch rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700"
      >
        {COMPACT_OPTIONS.map((o) => {
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              aria-pressed={active}
              aria-label={o.label}
              title={o.label}
              className={
                'flex h-7 w-7 items-center justify-center rounded transition-colors ' +
                (active
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100')
              }
            >
              {o.icon}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Přepnout motiv"
      className="inline-flex w-full items-stretch rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700"
    >
      {FULL_OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={active}
            className={
              'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SunIcon(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
