/**
 * Popup shell. Mirrors the Clockify-style layout from PRD §10.3:
 * company switcher, quick-start row, parallel running timers, This week
 * grouped by day, ⋯ menu per entry, Play again button. The full UI is
 * stubbed here — the data + queue layer it depends on is covered by
 * `queue.test.ts`.
 */
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

interface RunningTimer {
  id: string;
  description: string;
  startedAt: string;
}

export function Popup(): ReactElement {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [timers] = useState<RunningTimer[]>([]);

  useEffect(() => {
    const update = (): void => setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div className="w-[360px] p-3 text-sm">
      <header className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Time Tracker</span>
        {(!online || pending > 0) && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            {!online ? 'Offline' : `${pending} čeká na synchronizaci`}
          </span>
        )}
      </header>
      <section aria-label="Spustit nové měření">
        <button
          type="button"
          className="w-full rounded bg-zinc-900 py-2 text-white"
          onClick={() => setPending((n) => n + 1)}
        >
          Spustit
        </button>
      </section>
      <ul className="mt-3 divide-y divide-zinc-200" aria-label="Běží">
        {timers.map((t) => (
          <li key={t.id} className="py-1">
            {t.description || '(bez popisu)'}
          </li>
        ))}
      </ul>
    </div>
  );
}
