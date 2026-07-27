// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@tt/ui';
import { TimerLists } from './TimerLists';

// vitest.config.ts does not set `test.globals: true`, so testing-library's
// auto-cleanup never registers on its own — see ClientName.test.tsx.
afterEach(cleanup);

// Identity stub: lets assertions check for the translation *key* rather than
// requiring a real NextIntlClientProvider + message catalog.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Stubbed so the row can render (and so we can prove the stop mutation is
// never reached) without a real server action / DB.
const stopTimerAction = vi.fn();
vi.mock('@/lib/actions/time', () => ({
  stopTimerAction: (...args: unknown[]) => stopTimerAction(...args),
  restoreEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  playAgainAction: vi.fn(),
  getEntryEditContextAction: vi.fn(),
  updateEntryAction: vi.fn(),
}));

// Statically imported by AutoStackPreviewDialog/save-with-overlap-check but
// never invoked in this test (autoStackOverlaps stays false).
vi.mock('@/lib/actions/auto-stack', () => ({
  previewAutoStackAction: vi.fn(),
  saveEntryWithAutoStackAction: vi.fn(),
}));

const RUNNING_ENTRY = {
  id: 'entry-1',
  description: 'Writing tests',
  clientName: null,
  clientColor: null,
  projectName: null,
  startedAt: new Date('2026-07-27T10:00:00.000Z').toISOString(),
};

function renderTimerLists(): ReturnType<typeof render> {
  // Wrapped in StrictMode to match `next.config.mjs`'s `reactStrictMode: true`
  // — dev mounts every effect, runs its cleanup, then re-mounts on the same
  // fiber. That double-invoke is exactly what exposes a `cancelledRef` that
  // isn't reset per effect run (Important 1): the cleanup sets it `true` and
  // nothing ever sets it back to `false` on remount.
  return render(
    <StrictMode>
      <ConfirmProvider>
        <TimerLists
          wsUrl={null}
          initialRunning={[RUNNING_ENTRY]}
          initialHistory={[]}
          initialNowMs={Date.now()}
        />
      </ConfirmProvider>
    </StrictMode>,
  );
}

describe('TimerLists — stale-stop guard (US-103)', () => {
  it('US-103: a stop click on an entry another tab already stopped is blocked and surfaces a notice', async () => {
    // The refetch that `guardStillRunning` fires before acting on the click
    // comes back with the entry no longer present — another tab already
    // stopped it.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ running: [], history: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderTimerLists();

    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));

    // The guard must block the mutation entirely: this is the whole point of
    // Task 13's pre-mutation refetch, and it's exactly what a `cancelledRef`
    // stuck at `true` (Important 1, StrictMode double-invoke) would defeat —
    // `refetch` would bail before parsing, `runningRef` would never update,
    // and the entry would still read as "running", so `stopTimerAction`
    // WOULD be called here instead.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(stopTimerAction).not.toHaveBeenCalled();

    // And the neutral "already stopped elsewhere" notice must be shown
    // (identity-mocked next-intl surfaces the translation key itself).
    expect(await screen.findByText('alreadyStopped')).toBeInTheDocument();

    // The row itself must be gone from the list too.
    expect(screen.queryByText('Writing tests')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
