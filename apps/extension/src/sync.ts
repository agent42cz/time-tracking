/**
 * Hook that wires the popup to:
 *   - the WS bridge (refetch when web/server events arrive)
 *   - online/offline detection
 *   - the existing OfflineQueue (mutations queue on network error,
 *     replay automatically when connectivity returns)
 *
 * The popup wraps every mutation in `executeOrEnqueue`. On a "real"
 * network failure (not a 4xx/5xx response) the mutation goes into the
 * queue with all info needed to replay it later. On reconnect the queue
 * drains in order; conflicts are dropped with a toast.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessBlockedError,
  ApiError,
  createManualEntry,
  createProject,
  deleteEntry,
  playAgain,
  startTimer,
  stopTimer,
  updateEntry,
  type ApiSession,
  type ManualEntryApiInput,
  type OverlapInfo,
  type StartTimerInput,
  type StopTimerResult,
  type UpdateEntryPatch,
} from './api.js';
import { OfflineQueue, type Mutation } from './queue.js';
import { PendingOverlaps } from './pending-overlaps.js';
import { Diag } from './diag.js';
import {
  InMemoryStorageAdapter,
  createChromeStorageAdapter,
  type StorageAdapter,
} from './storage.js';

const storage: StorageAdapter =
  typeof chrome !== 'undefined' && chrome?.storage?.local
    ? createChromeStorageAdapter()
    : new InMemoryStorageAdapter();

const queue = new OfflineQueue(storage);
const pendingOverlaps = new PendingOverlaps(storage);
/**
 * One id per popup mount (module re-evaluates every time the popup opens),
 * so the merged diagnostic timeline can tell separate windows/profiles apart
 * (US-104). Exported so the popup can read/clear the same buffer.
 */
export const diag = new Diag(storage, 'popup', crypto.randomUUID());

interface UseSyncArgs {
  session: ApiSession | null;
  wsUrl: string | null;
  companyId: string | null;
  /** Called when the popup should refetch its data (WS event, drain, etc.). */
  onRefresh: () => void | Promise<void>;
}

export interface SyncState {
  online: boolean;
  pending: number;
  conflicts: number;
  /** Wraps a mutation: tries the network first, queues on offline failure. */
  executeStart: (input: StartTimerInput) => Promise<void>;
  executeStop: (entryId: string) => Promise<void>;
  executePlayAgain: (entryId: string) => Promise<void>;
  executeDelete: (entryId: string) => Promise<void>;
  executeUpdate: (entryId: string, patch: UpdateEntryPatch) => Promise<void>;
  executeCreateManual: (input: ManualEntryApiInput) => Promise<void>;
  /** Online-only (admin setup action). Returns the new project or throws on failure. */
  executeCreateProject: (clientId: string, name: string) => Promise<{ id: string }>;
  /** Head of the pending stop-overlap queue, or null. */
  pendingOverlap: OverlapInfo | null;
  /** Remove a resolved/dismissed overlap and advance to the next. */
  resolvePendingOverlap: (entryId: string) => Promise<void>;
}

/**
 * Should this failure be treated as "we are offline" — i.e. queue the mutation
 * and replay it later? Only a genuine transport failure qualifies. A response
 * from the server (`ApiError`) is a decision, not an outage; an access proxy
 * bouncing us to its login page (`AccessBlockedError`, AIAGE-66) is a server
 * misconfiguration that replaying cannot fix — queueing it made every start
 * vanish into the offline queue while the popup claimed all was well.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return false;
  if (err instanceof AccessBlockedError) return false;
  if (err instanceof TypeError) return true; // fetch threw before getting a response
  return true;
}

const ACCESS_BLOCKED_MESSAGE =
  'Server neodpověděl — požadavek zachytila ochranná proxy. Kontaktujte správce.';

/**
 * What the popup shows after a mutation failed. A blocked request is named for
 * what it is: the app itself never answered, so "zkuste to znovu" would be a
 * lie (AIAGE-66).
 */
export function mutationErrorMessage(err: unknown): string {
  if (err instanceof AccessBlockedError) return ACCESS_BLOCKED_MESSAGE;
  return 'Nepodařilo se spustit';
}

/** Same distinction on the load/login path, where the fallback names the connection. */
export function connectionErrorMessage(err: unknown): string {
  if (err instanceof AccessBlockedError) return ACCESS_BLOCKED_MESSAGE;
  return 'Nelze se připojit k serveru';
}

/**
 * How the replay loop treats a failed mutation. `blocked` is reported
 * separately from `reason` so the diagnostic buffer records *why* a flush
 * applied nothing — the AIAGE-66 log showed only `{applied: 0, conflicts: 0}`,
 * which is equally consistent with an empty queue.
 */
export function classifyReplayFailure(err: unknown): {
  reason: 'conflict' | 'transient';
  blocked: boolean;
} {
  if (err instanceof AccessBlockedError) return { reason: 'transient', blocked: true };
  if (err instanceof ApiError) return { reason: 'conflict', blocked: false };
  return { reason: 'transient', blocked: false };
}

function nudgeServiceWorker(): void {
  if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
  try {
    void chrome.runtime.sendMessage({ type: 'tt:refresh' });
  } catch {
    // Service worker may not be running yet; alarms will catch it within 30s.
  }
}

export function useExtensionSync({ session, wsUrl, companyId, onRefresh }: UseSyncArgs): SyncState {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  const [pendingOverlap, setPendingOverlap] = useState<OverlapInfo | null>(null);

  const refreshPendingOverlap = useCallback(async (): Promise<void> => {
    setPendingOverlap(await pendingOverlaps.head());
  }, []);

  // --- pending count, refresh on mount
  useEffect(() => {
    void queue.size().then(setPending);
    void refreshPendingOverlap();
  }, [refreshPendingOverlap]);

  // --- network status
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // --- drain on reconnect / mount / after each mutation
  const drain = useCallback(async (): Promise<void> => {
    if (!session) return;
    let blocked = false;
    const result = await queue.flush(
      async (m) => {
        try {
          const r = await replayMutation(session, m);
          if (m.kind === 'stopTimer' && r && r.overlap) {
            try {
              await pendingOverlaps.add(r.overlap);
            } catch {
              /* non-fatal: the stop succeeded; surfacing the overlap is best-effort */
            }
          }
          return { ok: true as const };
        } catch (err) {
          const verdict = classifyReplayFailure(err);
          if (verdict.blocked) blocked = true;
          return { ok: false, reason: verdict.reason };
        }
      },
      {
        onConflict: () => setConflicts((c) => c + 1),
      },
    );
    void diag.log('queue:flush', {
      applied: result.applied,
      conflicts: result.conflicts,
      // Without this, a flush that a proxy refused is indistinguishable in the
      // log from a flush that had nothing to do (AIAGE-66).
      ...(blocked ? { blocked: true } : {}),
    });
    setPending(await queue.size());
    await refreshPendingOverlap();
    if (result.applied > 0 || result.conflicts > 0) {
      await refreshRef.current();
    }
  }, [session, refreshPendingOverlap]);

  useEffect(() => {
    if (online && session) void drain();
  }, [online, session, drain]);

  // --- WS bridge
  useEffect(() => {
    if (!session || !wsUrl) return;
    let ws: WebSocket | null = null;
    let backoff = 500;
    let cancelled = false;

    function connect(): void {
      if (cancelled) return;
      const url = `${wsUrl}/?token=${encodeURIComponent(session!.token)}`;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.addEventListener('open', () => {
        backoff = 500;
        void diag.log('ws:open');
      });
      ws.addEventListener('message', (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; channel?: string };
          if (msg.type && (msg.type.startsWith('time_entry.') || msg.type.startsWith('timer.'))) {
            void diag.log('ws:event', { type: msg.type });
            void refreshRef.current();
          }
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener('close', () => {
        void diag.log('ws:close');
        if (cancelled) return;
        setTimeout(connect, backoff);
        backoff = Math.min(30_000, backoff * 2);
      });
      ws.addEventListener('error', () => {
        ws?.close();
      });
    }

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [session, wsUrl]);

  /**
   * Try `netCall()`; on a network error enqueue `fallbackMutation` so it can
   * be replayed when connectivity returns.  Nudges the service worker and
   * triggers a refresh on every code path.
   */
  const executeOrEnqueue = useCallback(
    async (netCall: () => Promise<void>, fallbackMutation: Mutation): Promise<void> => {
      if (!session) return;
      try {
        await netCall();
        nudgeServiceWorker();
        await refreshRef.current();
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue(fallbackMutation);
          void diag.log('queue:enqueue', { kind: fallbackMutation.kind });
          if (fallbackMutation.kind === 'startTimer') void diag.log('start:queued');
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session],
  );

  const executeStart = useCallback(
    (input: StartTimerInput): Promise<void> => {
      void diag.log('start:click');
      return executeOrEnqueue(
        async () => {
          await startTimer(session!, companyId, input);
          void diag.log('start:ok');
        },
        {
          kind: 'startTimer',
          payload: { ...input, companyId },
          clientId: crypto.randomUUID(),
        },
      );
    },
    [session, companyId, executeOrEnqueue],
  );

  const executeStop = useCallback(
    async (entryId: string): Promise<void> => {
      if (!session) return;
      void diag.log('stop:click', { entryId });
      let res: StopTimerResult;
      try {
        res = await stopTimer(session, entryId);
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'stopTimer',
            payload: { id: entryId },
            clientId: crypto.randomUUID(),
          });
          void diag.log('stop:queued');
          setPending(await queue.size());
          await refreshRef.current();
          return;
        }
        void diag.log('stop:error', {
          entryId,
          status: err instanceof ApiError ? err.status : null,
        });
        throw err;
      }
      // Stop committed server-side. Success-side effects run OUTSIDE the
      // network try so a storage error here can never be misread as offline
      // and enqueue a duplicate stop.
      void diag.log('stop:ok', { entryId, hadOverlap: Boolean(res.overlap) });
      nudgeServiceWorker();
      await refreshRef.current();
      if (res.overlap) {
        try {
          await pendingOverlaps.add(res.overlap);
          await refreshPendingOverlap();
        } catch {
          /* non-fatal: the stop is committed and the UI already refreshed;
             surfacing the overlap sheet is best-effort (mirrors drain). */
        }
      }
    },
    [session, refreshPendingOverlap],
  );

  const executePlayAgain = useCallback(
    (entryId: string): Promise<void> =>
      executeOrEnqueue(
        async () => {
          await playAgain(session!, entryId);
        },
        {
          // play-again replays as a fresh start with the same metadata
          kind: 'startTimer',
          payload: { sourceEntryId: entryId },
          clientId: crypto.randomUUID(),
        },
      ),
    [session, executeOrEnqueue],
  );

  const executeDelete = useCallback(
    (entryId: string): Promise<void> =>
      executeOrEnqueue(
        async () => {
          await deleteEntry(session!, entryId);
        },
        {
          kind: 'deleteEntry',
          payload: { id: entryId },
          clientId: crypto.randomUUID(),
        },
      ),
    [session, executeOrEnqueue],
  );

  const executeUpdate = useCallback(
    (entryId: string, patch: UpdateEntryPatch): Promise<void> =>
      executeOrEnqueue(() => updateEntry(session!, entryId, patch), {
        kind: 'updateEntry',
        payload: { id: entryId, patch: patch as unknown as Record<string, unknown> },
        clientId: crypto.randomUUID(),
      }),
    [session, executeOrEnqueue],
  );

  const executeCreateManual = useCallback(
    (input: ManualEntryApiInput): Promise<void> =>
      executeOrEnqueue(
        async () => {
          await createManualEntry(session!, companyId, input);
        },
        {
          kind: 'createManual',
          payload: { ...input, companyId },
          clientId: crypto.randomUUID(),
        },
      ),
    [session, companyId, executeOrEnqueue],
  );

  const executeCreateProject = useCallback(
    async (clientId: string, name: string): Promise<{ id: string }> => {
      if (!session) throw new ApiError(401, 'no_session');
      const created = await createProject(session, { clientId, name });
      await refreshRef.current();
      return created;
    },
    [session],
  );

  const resolvePendingOverlap = useCallback(
    async (entryId: string): Promise<void> => {
      await pendingOverlaps.remove(entryId);
      await refreshPendingOverlap();
    },
    [refreshPendingOverlap],
  );

  return {
    online,
    pending,
    conflicts,
    executeStart,
    executeStop,
    executePlayAgain,
    executeDelete,
    executeUpdate,
    executeCreateManual,
    executeCreateProject,
    pendingOverlap,
    resolvePendingOverlap,
  };
}

async function replayMutation(
  session: ApiSession,
  m: Mutation,
): Promise<{ overlap: OverlapInfo | null } | void> {
  switch (m.kind) {
    case 'startTimer': {
      const p = m.payload as { sourceEntryId?: string } & StartTimerInput & { companyId?: string };
      if (p.sourceEntryId) await playAgain(session, p.sourceEntryId);
      else await startTimer(session, (p.companyId as string | null) ?? null, p);
      return;
    }
    case 'stopTimer':
      return await stopTimer(session, (m.payload as { id: string }).id);
    case 'deleteEntry':
      await deleteEntry(session, (m.payload as { id: string }).id);
      return;
    case 'createManual': {
      const p = m.payload as unknown as ManualEntryApiInput & { companyId?: string | null };
      await createManualEntry(session, (p.companyId as string | null) ?? null, p);
      return;
    }
    case 'updateEntry': {
      const p = m.payload as { id: string; patch: UpdateEntryPatch };
      await updateEntry(session, p.id, p.patch);
      return;
    }
  }
}
