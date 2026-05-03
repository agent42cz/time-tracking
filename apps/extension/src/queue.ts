/**
 * Offline mutation queue (PRD §10.4 / US-34, US-35).
 *
 * Mutations made while offline are appended to a FIFO queue that is
 * persisted in chrome.storage.local via the StorageAdapter. On
 * reconnect, `flush(send)` replays them in order. If the server reports
 * a conflict (e.g. the row was already updated), the queue surfaces the
 * conflict to the caller (non-blocking toast in the UI) and continues
 * with the next mutation. The server is always authoritative.
 *
 * Persistence guarantee: every mutation is committed to storage BEFORE
 * the corresponding network call, so a browser kill mid-replay leaves a
 * complete queue we can resume from.
 */
import type { StorageAdapter } from './storage.js';

export type Mutation =
  | { kind: 'startTimer'; payload: Record<string, unknown>; clientId: string }
  | { kind: 'stopTimer'; payload: { id: string }; clientId: string }
  | { kind: 'createManual'; payload: Record<string, unknown>; clientId: string }
  | { kind: 'updateEntry'; payload: { id: string; patch: Record<string, unknown> }; clientId: string }
  | { kind: 'deleteEntry'; payload: { id: string }; clientId: string };

export interface QueueState {
  mutations: Mutation[];
  /** Wall-clock of the last successful flush. */
  lastFlushAt: number | null;
}

const STORAGE_KEY = 'tt:offline-queue';

export class OfflineQueue {
  constructor(private storage: StorageAdapter) {}

  async load(): Promise<QueueState> {
    return (await this.storage.get<QueueState>(STORAGE_KEY)) ?? {
      mutations: [],
      lastFlushAt: null,
    };
  }

  async enqueue(mut: Mutation): Promise<void> {
    const state = await this.load();
    state.mutations.push(mut);
    await this.storage.set(STORAGE_KEY, state);
  }

  async size(): Promise<number> {
    return (await this.load()).mutations.length;
  }

  async clear(): Promise<void> {
    await this.storage.remove(STORAGE_KEY);
  }

  /** Returns counts: applied, conflicts. Each conflict is reported via `onConflict`. */
  async flush(
    send: (m: Mutation) => Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'transient' }>,
    options: { onConflict?: (m: Mutation) => void } = {},
    now: () => number = Date.now,
  ): Promise<{ applied: number; conflicts: number }> {
    const state = await this.load();
    let applied = 0;
    let conflicts = 0;
    while (state.mutations.length > 0) {
      const head = state.mutations[0]!;
      const result = await send(head);
      if (result.ok) {
        state.mutations.shift();
        applied += 1;
      } else if (result.reason === 'conflict') {
        // Server is authoritative; drop this mutation but report it.
        state.mutations.shift();
        conflicts += 1;
        options.onConflict?.(head);
      } else {
        // Transient — bail out, leave the queue intact for the next attempt.
        await this.storage.set(STORAGE_KEY, state);
        return { applied, conflicts };
      }
      // Persist after each step to survive a browser kill.
      await this.storage.set(STORAGE_KEY, state);
    }
    state.lastFlushAt = now();
    await this.storage.set(STORAGE_KEY, state);
    return { applied, conflicts };
  }
}
