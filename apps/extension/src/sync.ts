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
  ApiError,
  deleteEntry,
  playAgain,
  startTimer,
  stopTimer,
  type ApiSession,
  type StartTimerInput,
} from './api.js';
import { OfflineQueue, type Mutation } from './queue.js';
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
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return false;
  if (err instanceof TypeError) return true; // fetch threw before getting a response
  return true;
}

function nudgeServiceWorker(): void {
  if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
  try {
    void chrome.runtime.sendMessage({ type: 'tt:refresh' });
  } catch {
    // Service worker may not be running yet; alarms will catch it within 30s.
  }
}

export function useExtensionSync({
  session,
  wsUrl,
  companyId,
  onRefresh,
}: UseSyncArgs): SyncState {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  // --- pending count, refresh on mount
  useEffect(() => {
    void queue.size().then(setPending);
  }, []);

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
    const result = await queue.flush(
      async (m) => {
        try {
          await replayMutation(session, m);
          return { ok: true as const };
        } catch (err) {
          if (err instanceof ApiError) return { ok: false, reason: 'conflict' };
          return { ok: false, reason: 'transient' };
        }
      },
      {
        onConflict: () => setConflicts((c) => c + 1),
      },
    );
    setPending(await queue.size());
    if (result.applied > 0 || result.conflicts > 0) {
      await refreshRef.current();
    }
  }, [session]);

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
      });
      ws.addEventListener('message', (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; channel?: string };
          if (
            msg.type &&
            (msg.type.startsWith('time_entry.') || msg.type.startsWith('timer.'))
          ) {
            void refreshRef.current();
          }
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener('close', () => {
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

  const executeStart = useCallback(
    async (input: StartTimerInput): Promise<void> => {
      if (!session) return;
      try {
        await startTimer(session, companyId, input);
        nudgeServiceWorker();
        await refreshRef.current();
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'startTimer',
            payload: { ...input, companyId },
            clientId: crypto.randomUUID(),
          });
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session, companyId],
  );

  const executeStop = useCallback(
    async (entryId: string): Promise<void> => {
      if (!session) return;
      try {
        await stopTimer(session, entryId);
        nudgeServiceWorker();
        await refreshRef.current();
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'stopTimer',
            payload: { id: entryId },
            clientId: crypto.randomUUID(),
          });
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session],
  );

  const executePlayAgain = useCallback(
    async (entryId: string): Promise<void> => {
      if (!session) return;
      try {
        await playAgain(session, entryId);
        nudgeServiceWorker();
        await refreshRef.current();
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'startTimer', // play-again replays as a fresh start with the same metadata
            payload: { sourceEntryId: entryId },
            clientId: crypto.randomUUID(),
          });
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session],
  );

  const executeDelete = useCallback(
    async (entryId: string): Promise<void> => {
      if (!session) return;
      try {
        await deleteEntry(session, entryId);
        nudgeServiceWorker();
        await refreshRef.current();
      } catch (err) {
        if (isNetworkError(err)) {
          await queue.enqueue({
            kind: 'deleteEntry',
            payload: { id: entryId },
            clientId: crypto.randomUUID(),
          });
          setPending(await queue.size());
          await refreshRef.current();
        } else {
          throw err;
        }
      }
    },
    [session],
  );

  return { online, pending, conflicts, executeStart, executeStop, executePlayAgain, executeDelete };
}

async function replayMutation(session: ApiSession, m: Mutation): Promise<void> {
  switch (m.kind) {
    case 'startTimer': {
      const p = m.payload as { sourceEntryId?: string } & StartTimerInput & { companyId?: string };
      if (p.sourceEntryId) await playAgain(session, p.sourceEntryId);
      else await startTimer(session, (p.companyId as string | null) ?? null, p);
      return;
    }
    case 'stopTimer':
      await stopTimer(session, (m.payload as { id: string }).id);
      return;
    case 'deleteEntry':
      await deleteEntry(session, (m.payload as { id: string }).id);
      return;
    case 'createManual':
    case 'updateEntry':
      // Not exposed in popup yet — drop silently rather than 4xx the queue.
      return;
  }
}
