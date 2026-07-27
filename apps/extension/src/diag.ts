/**
 * Diagnostic ring buffer (US-104).
 *
 * The popup unmounts every time it closes, so console output is gone before
 * anyone can read it — and `local/no-console-in-src` bans console anyway.
 * Instead every surface appends to one capped buffer in chrome.storage.local,
 * tagged with a per-instance id so separate windows, and separate Chrome
 * profiles, stay distinguishable in the merged timeline.
 */
import type { StorageAdapter } from './storage.js';

export const DIAG_KEY = 'tt:diag';
export const DIAG_CAP = 300;

export interface DiagRecord {
  ts: number;
  surface: 'popup' | 'sw' | 'web';
  instance: string;
  event: string;
  data?: Record<string, unknown>;
}

export class Diag {
  constructor(
    private storage: StorageAdapter,
    private surface: DiagRecord['surface'],
    private instance: string,
    private now: () => number = Date.now,
  ) {}

  async log(event: string, data?: Record<string, unknown>): Promise<void> {
    try {
      const rows = (await this.storage.get<DiagRecord[]>(DIAG_KEY)) ?? [];
      const rec: DiagRecord = {
        ts: this.now(),
        surface: this.surface,
        instance: this.instance,
        event,
        ...(data ? { data } : {}),
      };
      rows.push(rec);
      const trimmed = rows.length > DIAG_CAP ? rows.slice(rows.length - DIAG_CAP) : rows;
      await this.storage.set(DIAG_KEY, trimmed);
    } catch {
      // Diagnostics must never break a mutation. Losing a record is fine.
    }
  }

  async read(): Promise<DiagRecord[]> {
    return (await this.storage.get<DiagRecord[]>(DIAG_KEY)) ?? [];
  }

  async clear(): Promise<void> {
    await this.storage.remove(DIAG_KEY);
  }
}
