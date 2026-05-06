'use client';

import { useEffect } from 'react';
import { TIMER_CHANGED_EVENT, TimerStateResponseSchema } from '@/lib/timer-events';

const SIZES = [16, 32, 48, 128] as const;

function setFavicon(state: 'idle' | 'active'): void {
  // Mutate href on existing <link rel="icon"> elements in place. We do not
  // remove or replace them — those nodes are owned by React (rendered from
  // the root layout's `metadata.icons`), and removing them out-of-band makes
  // React crash with "Cannot read properties of null (reading 'removeChild')"
  // when it later tries to reconcile the head.
  const links = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    ),
  );
  for (const link of links) {
    const sizesAttr = link.getAttribute('sizes') ?? '';
    const size = SIZES.find((s) => sizesAttr.startsWith(`${s}x`)) ?? 32;
    link.href = `/icons/icon-${size}-${state}.png`;
  }
}

export function FaviconSwitcher(): null {
  useEffect(() => {
    let cancelled = false;
    let current: 'idle' | 'active' | null = null;

    async function check(): Promise<void> {
      try {
        const res = await fetch('/api/v1/timer', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return;
        const parsed = TimerStateResponseSchema.safeParse(await res.json());
        if (!parsed.success) return;
        const next: 'idle' | 'active' = (parsed.data.running ?? []).length > 0 ? 'active' : 'idle';
        if (!cancelled && next !== current) {
          setFavicon(next);
          current = next;
        }
      } catch {
        // ignore network/parse errors — keep current favicon
      }
    }

    void check();
    const onChange = (): void => void check();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener(TIMER_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener(TIMER_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
