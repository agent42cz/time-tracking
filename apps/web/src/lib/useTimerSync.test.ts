// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TtShared from '@tt/shared';
import { useTimerSync } from './useTimerSync.js';

const subscribe = vi.fn();
const close = vi.fn();
// The real `WsClient.subscribe` always returns an unsubscribe function; the
// mock must too, or `unsubscribe()` in the effect cleanup is never actually
// exercised (Minor 3).
const off = vi.fn();
vi.mock('@tt/shared', async (orig) => ({
  ...(await orig<typeof TtShared>()),
  createWsClient: vi.fn(() => ({ subscribe, close, readyState: () => 1 })),
}));

describe('useTimerSync', () => {
  beforeEach(() => {
    subscribe.mockClear();
    close.mockClear();
    off.mockClear();
    subscribe.mockReturnValue(off);
  });

  it('US-103: does not open a socket when there is no ws url', () => {
    renderHook(() => useTimerSync(null, vi.fn()));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('US-103: fires onChange for timer and time_entry events only', () => {
    const onChange = vi.fn();
    renderHook(() => useTimerSync('wss://x.test/ws', onChange));
    const listener = subscribe.mock.calls[0]![0] as (e: { type: string }) => void;

    listener({ type: 'timer.started' });
    listener({ type: 'time_entry.updated' });
    listener({ type: 'membership.changed' });

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('US-103: closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useTimerSync('wss://x.test/ws', vi.fn()));
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('US-103: unsubscribes from the socket on unmount', () => {
    const { unmount } = renderHook(() => useTimerSync('wss://x.test/ws', vi.fn()));
    unmount();
    expect(off).toHaveBeenCalled();
  });
});
