'use client';

import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Alert, Button } from '@tt/ui';
import { useTranslations } from 'next-intl';
import { unstable_rethrow } from 'next/navigation';
import {
  TIMER_CHANGED_EVENT,
  TimerStateResponseSchema,
  notifyTimerChanged,
  type TimerEntry,
} from '@/lib/timer-events';
import { restoreEntryAction } from '@/lib/actions/time';
import { useTimerSync } from '@/lib/useTimerSync';
import { RunningTimers } from './RunningTimers';
import { TimerHistory, type HistoryEntryView } from './TimerHistory';

/** How long the "Vrátit zpět" affordance stays on screen after a delete. */
export const UNDO_WINDOW_MS = 10_000;
/** How long the "already stopped elsewhere" notice stays on screen (US-103). */
const NOTICE_WINDOW_MS = 6_000;

interface RunningEntry {
  id: string;
  description: string;
  clientName: string | null;
  clientColor: string | null;
  projectName: string | null;
  startedAt: string;
}

function toRunning(e: TimerEntry): RunningEntry {
  return {
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    clientColor: e.clientColor,
    projectName: e.projectName,
    startedAt: e.startedAt,
  };
}

function toHistory(e: TimerEntry): HistoryEntryView | null {
  if (!e.endedAt) return null;
  return {
    id: e.id,
    description: e.description,
    clientName: e.clientName,
    clientColor: e.clientColor,
    projectName: e.projectName,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
  };
}

export function TimerLists({
  wsUrl,
  initialRunning,
  initialHistory,
  initialNowMs,
  autoStackOverlaps = false,
}: {
  wsUrl: string | null;
  initialRunning: RunningEntry[];
  initialHistory: HistoryEntryView[];
  initialNowMs: number;
  autoStackOverlaps?: boolean;
}): ReactElement {
  const [running, setRunning] = useState<RunningEntry[]>(initialRunning);
  const [history, setHistory] = useState<HistoryEntryView[]>(initialHistory);
  const [historyNowMs, setHistoryNowMs] = useState(initialNowMs);
  const [now, setNow] = useState<number | null>(null);
  const t = useTranslations('timer.undo');
  const tTimer = useTranslations('timer');
  const [undoId, setUndoId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const hasRunning = running.length > 0;

  // Mirrors `running` so an `async` handler can read the value that was just
  // set by `refetch()`, rather than the stale snapshot closed over at render
  // time. Updated synchronously alongside every `setRunning` call (not via a
  // `useEffect`), so it reflects the fresh list the instant `refetch()`'s
  // returned promise resolves — independent of whether React has re-rendered
  // yet. Reading `running` directly here would silently defeat the whole
  // point of Task 13's pre-mutation refetch (US-103).
  const runningRef = useRef<RunningEntry[]>(initialRunning);

  useEffect(() => {
    if (!hasRunning) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasRunning]);

  // The undo affordance is transient — it expires on its own.
  useEffect(() => {
    if (!undoId) return;
    const timer = setTimeout(() => setUndoId(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoId]);

  // So is the "already stopped elsewhere" notice (US-103).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Guards against a stale in-flight fetch resolving after unmount and
  // calling setState on a gone component. A ref (not a `useEffect`-local
  // `let`) so `refetch` can be hoisted into a stable `useCallback` below and
  // still be shared by the listener effect and `useTimerSync`.
  const cancelledRef = useRef(false);

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/v1/timer', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const parsed = TimerStateResponseSchema.safeParse(await res.json());
      if (!parsed.success || cancelledRef.current) return;
      const nextRunning = (parsed.data.running ?? []).map(toRunning);
      // Set the ref first (or at least in the same synchronous tick as the
      // state): callers that `await refetch()` and then read `runningRef`
      // must see this value, and that must not depend on React having
      // re-rendered in between.
      runningRef.current = nextRunning;
      setRunning(nextRunning);
      setHistory(
        (parsed.data.history ?? []).map(toHistory).filter((e): e is HistoryEntryView => e !== null),
      );
      setHistoryNowMs(Date.now());
    } catch {
      // ignore network/parse errors
    }
  }, []);

  // Fallbacks for when the socket is down or `wsUrl` is unset: same-tab
  // custom event, and refetch-on-focus for tabs that were merely hidden.
  useEffect(() => {
    const onChange = (): void => void refetch();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void refetch();
    };
    window.addEventListener(TIMER_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener(TIMER_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refetch]);

  // Live cross-tab sync (US-103): fires `refetch` on `timer.*`/`time_entry.*`
  // WS events from other tabs, windows, profiles, or the extension. No-ops
  // when `wsUrl` is null (WS_PUBLIC_URL unset).
  useTimerSync(wsUrl, refetch);

  const handleStopped = (id: string): void => {
    runningRef.current = runningRef.current.filter((r) => r.id !== id);
    setRunning((rs) => rs.filter((r) => r.id !== id));
  };

  // Re-fetches before a stop is even attempted (US-103): the socket closes
  // the race window between an external change and the frame that applies
  // it, but doesn't eliminate it — a click can still land against a stale
  // entry id. Returns whether `id` is genuinely still running *after* the
  // refetch; when it isn't, this already refreshed the list and surfaced a
  // neutral notice, so the caller only needs to skip its own mutation.
  const guardStillRunning = useCallback(
    async (id: string): Promise<boolean> => {
      await refetch();
      const stillRunning = runningRef.current.some((r) => r.id === id);
      if (!stillRunning) {
        setNotice(tTimer('alreadyStopped'));
      }
      return stillRunning;
    },
    [refetch, tTimer],
  );

  // Narrower race: the guard above saw the entry as running, but another
  // surface stopped it in the gap before our own mutation reached the
  // server. The mutation call site detects this from the action's result
  // (`reason: 'not_running'`) and reports it here instead of showing an
  // error.
  const reportStopConflict = useCallback((): void => {
    setNotice(tTimer('alreadyStopped'));
    void refetch();
  }, [refetch, tTimer]);

  const handleDeleted = (id: string): void => {
    setHistory((hs) => hs.filter((h) => h.id !== id));
    setUndoError(null);
    setUndoId(id);
  };

  const handleUndo = (): void => {
    const id = undoId;
    if (!id) return;
    setUndoId(null);
    // The action MUST run inside the `startTransition` returned by
    // `useTransition()` above — as it does in TrashList. React 19 routes *that*
    // transition's rejected async action to the nearest error boundary, which is
    // the only way `unstable_rethrow`'s re-thrown redirect digest can reach
    // `RedirectBoundary`. From a bare `void (async () => …)()` the rejection
    // belongs to a promise nobody holds, so it surfaces as an
    // `unhandledrejection` — no navigation, and no error Alert either.
    //
    // The top-level `startTransition` imported from 'react' is NOT a substitute:
    // it passes the rejection to `reportGlobalError`, reinstating the same bug
    // with an identical-looking call site. See docs/gotchas.md.
    startTransition(async () => {
      try {
        const result = await restoreEntryAction(id);
        if (!result.ok) {
          // e.g. the entry was purged from the trash in the meantime.
          setUndoError(t('failed'));
          return;
        }
        notifyTimerChanged();
      } catch (err) {
        // Re-throws Next's control-flow digests (redirect() from
        // requireActiveCompany on session expiry, notFound(), …) and returns for
        // everything else, so a genuine failure still reaches the Alert below.
        unstable_rethrow(err);
        setUndoError(t('failed'));
      }
    });
  };

  return (
    <>
      {running.length > 0 ? (
        <RunningTimers
          entries={running}
          now={now}
          onStopped={handleStopped}
          beforeStop={guardStillRunning}
          onStopConflict={reportStopConflict}
          autoStackOverlaps={autoStackOverlaps}
        />
      ) : null}
      {notice ? (
        <Alert tone="info" className="mb-3">
          {notice}
        </Alert>
      ) : null}
      {undoId ? (
        <Alert tone="info" className="mb-3 flex items-center justify-between gap-3">
          <span>{t('deleted')}</span>
          <Button size="sm" variant="ghost" onClick={handleUndo}>
            {t('action')}
          </Button>
        </Alert>
      ) : null}
      {undoError ? (
        <Alert tone="danger" className="mb-3">
          {undoError}
        </Alert>
      ) : null}
      <TimerHistory
        entries={history}
        onDeleted={handleDeleted}
        autoStackOverlaps={autoStackOverlaps}
        nowMs={historyNowMs}
      />
    </>
  );
}
