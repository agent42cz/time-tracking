// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as TtShared from '@tt/shared';
import { useTimerSync } from './useTimerSync.js';

const subscribe = vi.fn();
const close = vi.fn();
vi.mock('@tt/shared', async (orig) => ({
  ...(await orig<typeof TtShared>()),
  createWsClient: vi.fn(() => ({ subscribe, close, readyState: () => 1 })),
}));

describe('useTimerSync', () => {
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
});
