import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './storage.js';
import { PendingOverlaps } from './pending-overlaps.js';

const info = (id: string) => ({
  entryId: id,
  startedAt: '2026-06-17T10:00:00.000Z',
  endedAt: '2026-06-17T11:00:00.000Z',
});

describe('PendingOverlaps', () => {
  it('US-83: adds, heads, and removes overlaps FIFO', async () => {
    const store = new PendingOverlaps(new InMemoryStorageAdapter());
    await store.add(info('a'));
    await store.add(info('b'));
    expect((await store.head())?.entryId).toBe('a');
    await store.remove('a');
    expect((await store.head())?.entryId).toBe('b');
    await store.remove('b');
    expect(await store.head()).toBeNull();
  });

  it('US-83: dedupes by entryId', async () => {
    const store = new PendingOverlaps(new InMemoryStorageAdapter());
    await store.add(info('a'));
    await store.add(info('a'));
    expect(await store.list()).toHaveLength(1);
  });

  it('US-83: survives a fresh instance over the same storage (browser-kill resume)', async () => {
    const storage = new InMemoryStorageAdapter();
    await new PendingOverlaps(storage).add(info('a'));
    const reborn = new PendingOverlaps(storage);
    expect((await reborn.head())?.entryId).toBe('a');
  });
});
