import { describe, expect, it, vi } from 'vitest';
import { createWsClient } from './client.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  listeners = new Map<string, ((e: unknown) => void)[]>();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  emit(type: string, e?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  close(): void {
    this.readyState = 3;
  }
}

function makeClient(opts: { token?: string } = {}) {
  FakeSocket.instances = [];
  const client = createWsClient({
    url: 'wss://example.test/ws',
    ...opts,
    WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
  });
  return { client, sockets: FakeSocket.instances };
}

describe('createWsClient', () => {
  it('US-103: appends the token when one is supplied', () => {
    const { sockets } = makeClient({ token: 'abc def' });
    expect(sockets[0]!.url).toBe('wss://example.test/ws?token=abc%20def');
  });

  it('US-103: omits the query string entirely when there is no token, so the cookie authenticates', () => {
    const { sockets } = makeClient();
    expect(sockets[0]!.url).toBe('wss://example.test/ws');
  });

  it('US-103: delivers parsed events to every subscriber', () => {
    const { client, sockets } = makeClient();
    const seen: unknown[] = [];
    client.subscribe((e) => seen.push(e));
    sockets[0]!.emit('message', { data: JSON.stringify({ type: 'timer.stopped' }) });
    expect(seen).toEqual([{ type: 'timer.stopped' }]);
  });

  it('US-103: unsubscribing stops delivery', () => {
    const { client, sockets } = makeClient();
    const seen: unknown[] = [];
    const off = client.subscribe((e) => seen.push(e));
    off();
    sockets[0]!.emit('message', { data: JSON.stringify({ type: 'timer.stopped' }) });
    expect(seen).toEqual([]);
  });

  it('US-103: reconnects with exponential backoff after a close', () => {
    vi.useFakeTimers();
    const { sockets } = makeClient();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emit('close');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2); // 1000ms not yet elapsed
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    vi.useRealTimers();
  });

  it('US-103: an open resets the backoff to its floor', () => {
    vi.useFakeTimers();
    const { sockets } = makeClient();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(500);
    sockets[1]!.emit('open');
    sockets[1]!.emit('close');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(3);
    vi.useRealTimers();
  });

  it('US-103: close() stops reconnecting', () => {
    vi.useFakeTimers();
    const { client, sockets } = makeClient();
    client.close();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    vi.useRealTimers();
  });

  it('US-103: a malformed frame is reported and does not kill the socket', () => {
    const onError = vi.fn();
    FakeSocket.instances = [];
    const client = createWsClient({
      url: 'wss://example.test/ws',
      onError,
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
    });
    const seen: unknown[] = [];
    client.subscribe((e) => seen.push(e));
    FakeSocket.instances[0]!.emit('message', { data: 'not json' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});
