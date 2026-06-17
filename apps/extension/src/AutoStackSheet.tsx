import { useEffect, useState, type ReactElement } from 'react';
import {
  applyAutoStack,
  previewAutoStack,
  type ApiSession,
  type AutoStackDirection,
  type OverlapInfo,
  type WirePlan,
} from './api.js';
import { fromLocalInput, toLocalInput } from './datetime.js';

const TABS: { dir: AutoStackDirection; label: string }[] = [
  { dir: 'forward', label: 'Vpřed' },
  { dir: 'backward', label: 'Zpět' },
  { dir: 'manual', label: 'Ručně' },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function range(r: { startedAt: string; endedAt: string }): string {
  return `${fmt(r.startedAt)}–${fmt(r.endedAt)}`;
}

export function AutoStackSheet({
  session,
  overlap,
  onResolved,
  onDismiss,
}: {
  session: ApiSession;
  overlap: OverlapInfo;
  onResolved: () => void;
  onDismiss: () => void;
}): ReactElement {
  const [direction, setDirection] = useState<AutoStackDirection>('forward');
  const [manualStartedAt, setManualStartedAt] = useState<string>(overlap.startedAt);
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    const timer = setTimeout(() => {
      void previewAutoStack(session, overlap.entryId, {
        direction,
        startedAt: direction === 'manual' ? manualStartedAt : undefined,
      })
        .then((p) => {
          if (!cancelled) setPlan(p);
        })
        .catch(() => {
          if (!cancelled) setError('Náhled se nepodařilo načíst.');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, overlap.entryId, direction, manualStartedAt]);

  function save(): void {
    setBusy(true);
    void applyAutoStack(session, overlap.entryId, {
      direction,
      startedAt: direction === 'manual' ? manualStartedAt : undefined,
    })
      .then(() => onResolved())
      .catch(() => {
        setError('Uložení se nepodařilo.');
        setBusy(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full rounded-t-xl bg-white p-4 text-sm dark:bg-zinc-900">
        <h2 className="mb-1 font-medium">Tento záznam se překrývá s ostatními.</h2>
        <p className="mb-3 text-zinc-600 dark:text-zinc-400">Posunout záznamy, aby šly za sebou?</p>

        <div role="tablist" className="mb-3 flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.dir}
              type="button"
              role="tab"
              aria-selected={direction === tab.dir}
              className={`rounded px-3 py-2 ${
                direction === tab.dir
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              }`}
              onClick={() => setDirection(tab.dir)}
              disabled={busy}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {direction === 'manual' && (
          <label className="mb-3 block">
            <span className="mb-1 block text-zinc-700 dark:text-zinc-300">Začátek práce</span>
            <input
              type="datetime-local"
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              value={toLocalInput(manualStartedAt)}
              onChange={(e) => {
                if (!e.target.value) return; // empty input → new Date('') throws; ignore
                setManualStartedAt(fromLocalInput(e.target.value));
              }}
              disabled={busy}
            />
          </label>
        )}

        {plan && (
          <ul className="mb-3 space-y-1">
            <li className="font-medium">
              Tento záznam: {range(overlap)} → {range(plan.candidateAfter)}
            </li>
            {plan.shifts.map((s) => (
              <li key={s.entryId} className="text-zinc-600 dark:text-zinc-400">
                {range(s.before)} → {range(s.after)}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mb-3 text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-sm underline disabled:opacity-50"
            onClick={onDismiss}
            disabled={busy}
          >
            Uložit bez posunu
          </button>
          <div className="flex gap-2">
            <button type="button" className="rounded px-3 py-2" onClick={onDismiss} disabled={busy}>
              Zrušit
            </button>
            <button
              type="button"
              className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              onClick={save}
              disabled={busy || plan === null}
            >
              Posunout a uložit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
