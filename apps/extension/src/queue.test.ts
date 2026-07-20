/**
 * Phase 9 — extension tests. Covers US-29, US-30, US-32, US-33, US-34, US-35.
 *
 * The popup itself is composed of pure functions (queue, session manager)
 * and a thin React shell. Tests target the pure layer; layout is
 * verified manually per PRD §14.8 ("Things AI cannot fully automate").
 */
import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './storage.js';
import { OfflineQueue, type Mutation } from './queue.js';

function adapter(): InMemoryStorageAdapter {
  return new InMemoryStorageAdapter();
}

describe('extension popup', () => {
  it('US-29: persistent session — token survives across queue flushes', async () => {
    const store = adapter();
    await store.set('tt:session', { token: 'abc', userId: 'u-1' });
    const q = new OfflineQueue(store);
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'e-1' }, clientId: 'c-1' });
    await q.flush(() => Promise.resolve({ ok: true as const }));
    // Session token still present after the queue is fully flushed.
    expect(await store.get<{ token: string }>('tt:session')).toEqual({
      token: 'abc',
      userId: 'u-1',
    });
  });

  it('US-30: queue + state can be loaded on popup open (smoke)', async () => {
    const q = new OfflineQueue(adapter());
    expect(await q.size()).toBe(0);
    await q.enqueue({
      kind: 'startTimer',
      payload: { description: 'meeting' },
      clientId: 'c-1',
    });
    expect(await q.size()).toBe(1);
  });

  it('US-32: a queued startTimer is replayed verbatim on reconnect', async () => {
    const q = new OfflineQueue(adapter());
    const m: Mutation = {
      kind: 'startTimer',
      payload: { description: 'standup' },
      clientId: 'tab-42',
    };
    await q.enqueue(m);
    const sent: Mutation[] = [];
    const result = await q.flush((mut) => {
      sent.push(mut);
      return Promise.resolve({ ok: true });
    });
    expect(result.applied).toBe(1);
    expect(sent).toEqual([m]);
    expect(await q.size()).toBe(0);
  });

  it('US-33: "play again" enqueues a fresh startTimer (no edit-in-place)', async () => {
    const q = new OfflineQueue(adapter());
    const original: Mutation = {
      kind: 'startTimer',
      payload: { description: 'design review' },
      clientId: 'orig',
    };
    const playAgain: Mutation = {
      kind: 'startTimer',
      payload: { description: 'design review' },
      clientId: 'replay',
    };
    await q.enqueue(original);
    await q.flush(() => Promise.resolve({ ok: true }));
    await q.enqueue(playAgain);
    const sent: Mutation[] = [];
    await q.flush((m) => {
      sent.push(m);
      return Promise.resolve({ ok: true });
    });
    expect(sent).toEqual([playAgain]);
    expect(sent[0]!.clientId).not.toBe(original.clientId);
  });

  it('US-34: while offline, mutations queue up and replay in order on reconnect', async () => {
    const q = new OfflineQueue(adapter());
    const muts: Mutation[] = [
      { kind: 'startTimer', payload: { description: 'a' }, clientId: '1' },
      { kind: 'updateEntry', payload: { id: '1', patch: { description: 'b' } }, clientId: '2' },
      { kind: 'stopTimer', payload: { id: '1' }, clientId: '3' },
    ];
    for (const m of muts) await q.enqueue(m);
    expect(await q.size()).toBe(3);
    const sent: Mutation[] = [];
    await q.flush((m) => {
      sent.push(m);
      return Promise.resolve({ ok: true });
    });
    expect(sent).toEqual(muts);
    expect(await q.size()).toBe(0);
  });

  it('US-34: server conflict drops the mutation, surfaces it, continues with the next', async () => {
    const q = new OfflineQueue(adapter());
    await q.enqueue({
      kind: 'updateEntry',
      payload: { id: '1', patch: { description: 'stale' } },
      clientId: 'a',
    });
    await q.enqueue({
      kind: 'stopTimer',
      payload: { id: '1' },
      clientId: 'b',
    });
    const conflicts: Mutation[] = [];
    const result = await q.flush(
      (m) =>
        Promise.resolve(
          m.kind === 'updateEntry'
            ? { ok: false as const, reason: 'conflict' as const }
            : { ok: true as const },
        ),
      { onConflict: (m) => conflicts.push(m) },
    );
    expect(result.applied).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(conflicts).toHaveLength(1);
    expect(await q.size()).toBe(0);
  });

  it('US-34: a transient failure leaves the queue intact for retry', async () => {
    const q = new OfflineQueue(adapter());
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'x' }, clientId: 'a' });
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'y' }, clientId: 'b' });
    let calls = 0;
    const result = await q.flush(() => {
      calls += 1;
      return Promise.resolve({ ok: false as const, reason: 'transient' as const });
    });
    expect(calls).toBe(1);
    expect(result.applied).toBe(0);
    expect(await q.size()).toBe(2); // both still queued
  });

  it('US-34: a browser kill mid-replay resumes from where it left off', async () => {
    const store = adapter();
    const q = new OfflineQueue(store);
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'x' }, clientId: 'a' });
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'y' }, clientId: 'b' });

    // First flush "crashes" after one successful send.
    let calls = 0;
    try {
      await q.flush(() => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ ok: true as const });
        // Simulate a hard process kill — stop the iteration with an error.
        throw new Error('browser-killed');
      });
    } catch {
      // expected
    }
    // The queue persisted state after the successful one; one mutation left.
    expect(await q.size()).toBe(1);

    // A new "session" reconstructs the queue from storage.
    const q2 = new OfflineQueue(store);
    const sent: Mutation[] = [];
    await q2.flush((m) => {
      sent.push(m);
      return Promise.resolve({ ok: true });
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toEqual({ id: 'y' });
  });

  it('US-34: redundant offline stopTimer clicks collapse to one queued mutation (AIAGE-55)', async () => {
    // A user on an instance whose network has wedged hammers Stop three
    // times. Each click would enqueue a stopTimer; without dedup that
    // surfaces as three "unsynchronized events". stopTimer is an idempotent
    // terminal op keyed by entry id, so the queue must collapse them to one.
    const q = new OfflineQueue(adapter());
    for (let i = 0; i < 3; i++) {
      await q.enqueue({ kind: 'stopTimer', payload: { id: 'e-1' }, clientId: `click-${i}` });
    }
    expect(await q.size()).toBe(1);
    const sent: Mutation[] = [];
    await q.flush((m) => {
      sent.push(m);
      return Promise.resolve({ ok: true });
    });
    // The first click wins; later duplicates never entered the queue.
    expect(sent).toEqual([{ kind: 'stopTimer', payload: { id: 'e-1' }, clientId: 'click-0' }]);
  });

  it('US-34: idempotent dedup collapses same-id stops/deletes but keeps distinct ones (AIAGE-55)', async () => {
    const q = new OfflineQueue(adapter());
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'a' }, clientId: '1' });
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'a' }, clientId: '2' }); // dup → dropped
    await q.enqueue({ kind: 'stopTimer', payload: { id: 'b' }, clientId: '3' }); // other id → kept
    await q.enqueue({ kind: 'deleteEntry', payload: { id: 'a' }, clientId: '4' }); // other kind → kept
    await q.enqueue({ kind: 'deleteEntry', payload: { id: 'a' }, clientId: '5' }); // dup → dropped
    expect(await q.size()).toBe(3);
  });

  it('US-35: pendingCount > 0 is the unsynced indicator', async () => {
    const q = new OfflineQueue(adapter());
    expect(await q.size()).toBe(0);
    await q.enqueue({ kind: 'startTimer', payload: {}, clientId: 'c' });
    expect(await q.size()).toBeGreaterThan(0);
    await q.flush(() => Promise.resolve({ ok: true }));
    expect(await q.size()).toBe(0);
  });
});
