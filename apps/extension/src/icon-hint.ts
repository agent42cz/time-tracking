/**
 * Running-timer count the popup writes so the service worker can update the
 * toolbar icon without fetching. `background.js` listens on this key and
 * applies the count even when `/api/v1/timer` throws (poll:error).
 */
import type { StorageAdapter } from './storage.js';

export const ICON_HINT_KEY = 'tt:icon-hint';

export async function writeIconHint(storage: StorageAdapter, running: number): Promise<void> {
  await storage.set(ICON_HINT_KEY, running);
}
