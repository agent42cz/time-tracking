import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, groupRecentByDay, type RecentEntryInput } from './recent.js';

function entry(partial: Partial<RecentEntryInput> & { startedAt: string }): RecentEntryInput {
  return {
    id: partial.id ?? crypto.randomUUID(),
    description: partial.description ?? '',
    startedAt: partial.startedAt,
    endedAt: partial.endedAt ?? null,
    clientName: partial.clientName ?? null,
    projectName: partial.projectName ?? null,
  };
}

describe('groupRecentByDay', () => {
  // Pin "now" so the Dnes/Včera labels are deterministic across runs.
  const now = new Date('2026-05-14T22:00:00');

  it('returns [] when entries is undefined (server-side deploy skew)', () => {
    expect(groupRecentByDay(undefined, now)).toEqual([]);
    expect(groupRecentByDay(null, now)).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(groupRecentByDay([], now)).toEqual([]);
  });

  it('groups contiguous same-day entries into one bucket with a Dnes label', () => {
    const groups = groupRecentByDay(
      [
        entry({ startedAt: '2026-05-14T20:00:00', endedAt: '2026-05-14T21:00:00' }),
        entry({ startedAt: '2026-05-14T08:00:00', endedAt: '2026-05-14T09:30:00' }),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: '2026-05-14',
      label: 'Dnes',
      total: 60 * 60 * 1000 + 90 * 60 * 1000, // 1h + 1h30m
    });
    expect(groups[0]!.items).toHaveLength(2);
  });

  it('splits into multiple groups with Včera and weekday labels', () => {
    const groups = groupRecentByDay(
      [
        entry({ startedAt: '2026-05-14T20:00:00', endedAt: '2026-05-14T21:00:00' }),
        entry({ startedAt: '2026-05-13T10:00:00', endedAt: '2026-05-13T11:00:00' }),
        entry({ startedAt: '2026-05-11T08:00:00', endedAt: '2026-05-11T08:45:00' }),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Dnes', 'Včera', 'Po 11.05.']);
    expect(groups.map((g) => g.key)).toEqual(['2026-05-14', '2026-05-13', '2026-05-11']);
    expect(groups[2]!.total).toBe(45 * 60 * 1000);
  });

  it('clamps a still-running entry to `now` when computing the duration', () => {
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-05-14T21:30:00', endedAt: null })],
      now, // 22:00
    );
    expect(groups[0]!.total).toBe(30 * 60 * 1000);
  });

  it('does not merge non-contiguous same-day entries — preserves server order', () => {
    // If for any reason an entry from yesterday appears between two today
    // entries (out-of-order push, edited timestamps), we must NOT regroup it
    // into the earlier today bucket — the UI promises chronological order.
    const groups = groupRecentByDay(
      [
        entry({ id: 'a', startedAt: '2026-05-14T20:00:00', endedAt: '2026-05-14T21:00:00' }),
        entry({ id: 'b', startedAt: '2026-05-13T10:00:00', endedAt: '2026-05-13T11:00:00' }),
        entry({ id: 'c', startedAt: '2026-05-14T08:00:00', endedAt: '2026-05-14T09:00:00' }),
      ],
      now,
    );
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('dayKey / dayLabel', () => {
  it('dayKey produces local-zone YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-05-14T12:00:00'))).toBe('2026-05-14');
  });

  it('dayLabel returns Dnes / Včera for the matching keys', () => {
    expect(dayLabel(new Date('2026-05-14T12:00:00'), '2026-05-14', '2026-05-13')).toBe('Dnes');
    expect(dayLabel(new Date('2026-05-13T12:00:00'), '2026-05-14', '2026-05-13')).toBe('Včera');
  });

  it('dayLabel falls back to weekday + dd.mm. for older dates', () => {
    // 2026-05-11 is a Monday.
    expect(dayLabel(new Date('2026-05-11T12:00:00'), '2026-05-14', '2026-05-13')).toBe('Po 11.05.');
  });
});
