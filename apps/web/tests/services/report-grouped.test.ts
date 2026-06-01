/** Phase 12 — grouped report builder. Covers US-77. */
import { describe, expect, it } from 'vitest';
import { buildGroupedReport, type ReportRow } from '../../src/lib/services/reports.js';

const H = 60 * 60 * 1000;

function row(over: Partial<ReportRow>): ReportRow {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    userName: 'Alice',
    clientId: 'c1',
    clientName: 'Acme',
    projectId: 'p1',
    projectName: 'Web',
    description: 'work',
    startedAt: new Date('2026-05-04T08:00:00Z'),
    endedAt: new Date('2026-05-04T10:00:00Z'),
    durationMs: 2 * H,
    tags: [],
    ...over,
  };
}

describe('buildGroupedReport', () => {
  it('US-77: groups by project with per-project subtotals and a grand total', () => {
    const rows = [
      row({ projectId: 'p1', projectName: 'Web', clientName: 'Acme', durationMs: 2 * H }),
      row({ projectId: 'p1', projectName: 'Web', clientName: 'Acme', durationMs: 1 * H }),
      row({ projectId: 'p2', projectName: 'API', clientName: 'Beta', durationMs: 3 * H }),
    ];
    const g = buildGroupedReport(rows, { groupBy: 'project' });
    expect(g.groups).toHaveLength(2);
    const web = g.groups.find((x) => x.key === 'p1');
    expect(web?.subtotalMs).toBe(3 * H);
    expect(web?.clientName).toBe('Acme');
    expect(g.grandTotalMs).toBe(6 * H);
    expect(g.rowCount).toBe(3);
  });

  it('US-77: rows without a project fall into a single "Bez projektu" group', () => {
    const g = buildGroupedReport([row({ projectId: null, projectName: null, durationMs: 1 * H })], {
      groupBy: 'project',
    });
    expect(g.groups[0]!.key).toBe('none');
    expect(g.groups[0]!.label).toBe('Bez projektu');
  });

  it('US-77: groups by member', () => {
    const rows = [
      row({ userId: 'u1', userName: 'Alice', durationMs: 2 * H }),
      row({ userId: 'u2', userName: 'Bob', durationMs: 1 * H }),
      row({ userId: 'u1', userName: 'Alice', durationMs: 1 * H }),
    ];
    const g = buildGroupedReport(rows, { groupBy: 'member' });
    expect(g.groups.map((x) => x.key)).toEqual(['u1', 'u2']); // sorted by name
    expect(g.groups.find((x) => x.key === 'u1')?.subtotalMs).toBe(3 * H);
  });

  it('US-77: groups by Prague day, bucketing a cross-midnight entry by its start day', () => {
    // 2026-05-01 22:30 UTC = 2026-05-02 00:30 Prague (CEST).
    const g = buildGroupedReport(
      [row({ startedAt: new Date('2026-05-01T22:30:00Z'), durationMs: 1 * H })],
      { groupBy: 'day' },
    );
    expect(g.groups[0]!.key).toBe('2026-05-02');
  });

  it('US-77: empty input yields no groups and a zero grand total', () => {
    const g = buildGroupedReport([], { groupBy: 'project' });
    expect(g.groups).toEqual([]);
    expect(g.grandTotalMs).toBe(0);
    expect(g.rowCount).toBe(0);
  });

  it('US-77: a still-running entry is clamped at clampEnd for totals', () => {
    const periodEnd = new Date('2026-06-01T00:00:00Z');
    const g = buildGroupedReport(
      [
        row({
          startedAt: new Date('2026-05-31T22:00:00Z'),
          endedAt: null,
          durationMs: 999 * H, // would-be runaway if not clamped
        }),
      ],
      { groupBy: 'project', clampEnd: periodEnd },
    );
    expect(g.grandTotalMs).toBe(2 * H); // 22:00 -> 24:00 = 2h
  });

  it('US-77: a completed entry ending after clampEnd is clamped to the in-period portion', () => {
    const clampEnd = new Date('2026-06-01T00:00:00Z');
    const g = buildGroupedReport(
      [
        row({
          startedAt: new Date('2026-05-31T23:00:00Z'),
          endedAt: new Date('2026-06-01T02:00:00Z'),
          durationMs: 3 * H, // 3h recorded; only the first 1h falls inside the period
        }),
      ],
      { groupBy: 'project', clampEnd },
    );
    expect(g.grandTotalMs).toBe(1 * H); // 23:00 -> 24:00 = 1h; the 2h June tail is excluded
  });
});
