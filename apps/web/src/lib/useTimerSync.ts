'use client';

/**
 * Keeps the timer page in sync with changes made anywhere else — another tab,
 * another window, another Chrome profile, or the extension (US-103).
 *
 * Before this existed the page refetched only on its own `tt:timer-changed`
 * event and on `visibilitychange`, so two *visible* tabs never learned about
 * each other and acted on stale entry ids.
 *
 * Auth is the `tt-session` cookie: the WS server accepts either that or a
 * `?token=` query param, and the browser sends the cookie for us.
 */
import { useEffect, useRef } from 'react';
import { createWsClient } from '@tt/shared';

export function useTimerSync(wsUrl: string | null, onChange: () => void): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!wsUrl) return;
    const client = createWsClient({ url: wsUrl });
    const unsubscribe = client.subscribe((evt) => {
      if (evt.type.startsWith('timer.') || evt.type.startsWith('time_entry.')) {
        onChangeRef.current();
      }
    });
    return () => {
      unsubscribe();
      client.close();
    };
  }, [wsUrl]);
}
