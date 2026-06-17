/**
 * Persistent list of stop-induced overlaps awaiting user resolution.
 *
 * A stop always commits as a plain stop; if the server reports an overlap
 * (online immediately, or when a queued stop replays after reconnect), the
 * entry id lands here. The popup drains this list and shows the auto-stack
 * sheet for each. Stored in chrome.storage.local so a browser kill between
 * the replay and the popup opening doesn't lose the prompt.
 */
import type { StorageAdapter } from './storage.js';
import type { OverlapInfo } from './api.js';

const STORAGE_KEY = 'tt:pending-overlaps';

export class PendingOverlaps {
  constructor(private storage: StorageAdapter) {}

  async list(): Promise<OverlapInfo[]> {
    return (await this.storage.get<OverlapInfo[]>(STORAGE_KEY)) ?? [];
  }

  async add(info: OverlapInfo): Promise<void> {
    const all = await this.list();
    if (all.some((o) => o.entryId === info.entryId)) return;
    all.push(info);
    await this.storage.set(STORAGE_KEY, all);
  }

  async remove(entryId: string): Promise<void> {
    const all = (await this.list()).filter((o) => o.entryId !== entryId);
    if (all.length === 0) await this.storage.remove(STORAGE_KEY);
    else await this.storage.set(STORAGE_KEY, all);
  }

  async head(): Promise<OverlapInfo | null> {
    return (await this.list())[0] ?? null;
  }
}
