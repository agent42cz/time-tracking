// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@tt/ui';
import { AbsenceList, type AbsenceListItem } from './AbsenceList';

// vitest.config.ts does not set `test.globals: true`, so testing-library's
// auto-cleanup never registers on its own — see ClientName.test.tsx.
afterEach(cleanup);

// `useRouter().refresh()` is the only router surface this component touches;
// there is no app-router context under `render`.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const updateAbsenceAction = vi.fn(async (_id: string, _patch: unknown) => ({ ok: true as const }));
vi.mock('@/lib/actions/absences', () => ({
  updateAbsenceAction: (id: string, patch: unknown) => updateAbsenceAction(id, patch),
  deleteAbsenceAction: vi.fn(),
  markAbsenceSeenAction: vi.fn(async () => ({ ok: true })),
}));

// Fixed days, so the "has it already started" boundary never depends on the
// wall clock: MIN_DATE stands in for tomorrow in Europe/Prague, which the
// server computes and hands to the component.
const MIN_DATE = '2026-09-01';

function item(overrides: Partial<AbsenceListItem> = {}): AbsenceListItem {
  return {
    id: 'a1',
    userId: 'u1',
    userName: 'Mira',
    kind: 'vacation',
    startDate: '2026-09-10',
    endDate: '2026-09-15',
    note: '',
    seen: true,
    ...overrides,
  };
}

function renderList(items: AbsenceListItem[]): ReturnType<typeof render> {
  return render(
    <ConfirmProvider>
      <AbsenceList
        items={items}
        viewerId="u1"
        canAcknowledge={false}
        minDate={MIN_DATE}
        title="Nadcházející nepřítomnosti"
        emptyText="Žádná nahlášená nepřítomnost"
      />
    </ConfirmProvider>,
  );
}

describe('AbsenceList', () => {
  it('US-105: a multi-day notice carries the weekday on both ends of the range', () => {
    renderList([item()]);
    // Čt 10.09. → Út 15.09.2026 — the return day is what the reader plans
    // around, so it must not be a bare date.
    expect(screen.getByText('Čt 10.09.2026 – Út 15.09.2026')).toBeInTheDocument();
  });

  it('US-105: a one-day notice stays a single weekday + date', () => {
    renderList([item({ startDate: '2026-09-10', endDate: '2026-09-10' })]);
    expect(screen.getByText('Čt 10.09.2026')).toBeInTheDocument();
  });

  it('US-110: the author fixes a mistyped date in place instead of deleting the notice', async () => {
    renderList([item()]);
    fireEvent.click(screen.getByRole('button', { name: /Mira/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Upravit záznam' }));

    fireEvent.change(screen.getByLabelText('Od'), { target: { value: '2026-09-11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));

    await waitFor(() =>
      expect(updateAbsenceAction).toHaveBeenCalledWith('a1', {
        kind: 'vacation',
        startDate: '2026-09-11',
        endDate: '2026-09-15',
        note: '',
      }),
    );
  });

  it('US-106: a notice that already started offers no edit — the lead-time rule would reject the save', () => {
    renderList([item({ startDate: '2026-08-20', endDate: '2026-09-05' })]);
    fireEvent.click(screen.getByRole('button', { name: /Mira/ }));
    expect(screen.queryByRole('button', { name: 'Upravit záznam' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smazat záznam' })).toBeInTheDocument();
  });
});
