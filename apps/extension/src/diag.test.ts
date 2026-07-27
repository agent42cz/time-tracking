import { describe, expect, it } from 'vitest';
import { Diag, DIAG_CAP } from './diag.js';
import { InMemoryStorageAdapter } from './storage.js';

function makeDiag(instance = 'inst-1') {
  const storage = new InMemoryStorageAdapter();
  return { storage, diag: new Diag(storage, 'popup', instance, () => 1000) };
}

describe('Diag', () => {
  it('US-104: records an event with its surface, instance and payload', async () => {
    const { diag } = makeDiag();
    await diag.log('stop:click', { entryId: 'e1' });
    expect(await diag.read()).toEqual([
      {
        ts: 1000,
        surface: 'popup',
        instance: 'inst-1',
        event: 'stop:click',
        data: { entryId: 'e1' },
      },
    ]);
  });

  it('US-104: keeps records in chronological order', async () => {
    const { diag } = makeDiag();
    await diag.log('a');
    await diag.log('b');
    await diag.log('c');
    expect((await diag.read()).map((r) => r.event)).toEqual(['a', 'b', 'c']);
  });

  it('US-104: never grows past the cap and drops the oldest first', async () => {
    const { diag } = makeDiag();
    for (let i = 0; i < DIAG_CAP + 10; i += 1) await diag.log(`e${i}`);
    const rows = await diag.read();
    expect(rows).toHaveLength(DIAG_CAP);
    expect(rows[0]!.event).toBe('e10');
    expect(rows[rows.length - 1]!.event).toBe(`e${DIAG_CAP + 9}`);
  });

  it('US-104: two instances writing to one buffer stay distinguishable', async () => {
    const storage = new InMemoryStorageAdapter();
    const a = new Diag(storage, 'popup', 'A', () => 1);
    const b = new Diag(storage, 'sw', 'B', () => 2);
    await a.log('x');
    await b.log('y');
    const rows = await a.read();
    expect(rows.map((r) => [r.surface, r.instance, r.event])).toEqual([
      ['popup', 'A', 'x'],
      ['sw', 'B', 'y'],
    ]);
  });

  it('US-104: clear empties the buffer', async () => {
    const { diag } = makeDiag();
    await diag.log('a');
    await diag.clear();
    expect(await diag.read()).toEqual([]);
  });
});
