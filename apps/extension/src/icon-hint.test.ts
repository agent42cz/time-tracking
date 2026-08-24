import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './storage.js';
import { ICON_HINT_KEY, writeIconHint } from './icon-hint.js';

describe('icon hint', () => {
  it('US-31: writes the running-timer count so the service worker can update the icon without fetching', async () => {
    const storage = new InMemoryStorageAdapter();
    await writeIconHint(storage, 2);
    expect(await storage.get<number>(ICON_HINT_KEY)).toBe(2);
  });

  it('US-31: writing zero running timers clears the badge count', async () => {
    const storage = new InMemoryStorageAdapter();
    await writeIconHint(storage, 3);
    await writeIconHint(storage, 0);
    expect(await storage.get<number>(ICON_HINT_KEY)).toBe(0);
  });
});
