/**
 * Tiny WS client used by both the web app and the extension popup.
 * Auto-reconnects with exponential backoff capped at 30s. Listeners
 * subscribe by event type; the runtime channel is opaque to consumers.
 */
import type { WsEvent } from './index.js';

export type WsListener = (evt: WsEvent) => void;

export interface WsClient {
  subscribe: (listener: WsListener) => () => void;
  close: () => void;
  /** Test-only: current readyState (0..3) of the underlying socket. */
  readyState: () => number;
}

export interface WsClientOpts {
  url: string;
  token: string;
  /** Override for tests (default: global WebSocket). */
  WebSocketCtor?: typeof WebSocket;
  onError?: (err: unknown) => void;
}

const MAX_BACKOFF_MS = 30_000;

export function createWsClient(opts: WsClientOpts): WsClient {
  const Ctor = opts.WebSocketCtor ?? (globalThis.WebSocket as unknown as typeof WebSocket);
  const listeners = new Set<WsListener>();
  let socket: WebSocket | null = null;
  let backoff = 500;
  let closed = false;

  function connect(): void {
    if (closed) return;
    const url = `${opts.url}?token=${encodeURIComponent(opts.token)}`;
    socket = new Ctor(url);
    socket.addEventListener('open', () => {
      backoff = 500;
    });
    socket.addEventListener('message', (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as WsEvent;
        for (const l of listeners) l(parsed);
      } catch (err) {
        opts.onError?.(err);
      }
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      setTimeout(connect, backoff);
      backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
    });
    socket.addEventListener('error', (e) => opts.onError?.(e));
  }

  connect();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      socket?.close();
    },
    readyState() {
      return socket?.readyState ?? 3;
    },
  };
}
