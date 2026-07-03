import { describe, expect, it } from 'vitest';
import {
  buildExportUrl,
  resolveExportGroupBy,
} from '../../src/app/(authenticated)/reports/export-url.js';

function query(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('buildExportUrl', () => {
  it('US-89: scopes to selected members and targets the PDF route', () => {
    const url = buildExportUrl({
      format: 'pdf',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: false,
      memberIds: ['u1', 'u2'],
      groupBy: 'member',
    });
    expect(url.split('?')[0]).toBe('/api/reports/export.pdf');
    const q = query(url);
    expect(q.getAll('member')).toEqual(['u1', 'u2']);
    expect(q.get('from')).toBe('2026-06-01');
    expect(q.get('to')).toBe('2026-06-30');
    expect(q.get('groupBy')).toBe('member');
  });

  it('US-89: omits the member param entirely when exporting all members', () => {
    const url = buildExportUrl({
      format: 'pdf',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: true,
      memberIds: ['u1'],
      groupBy: 'member',
    });
    expect(query(url).has('member')).toBe(false);
  });

  it('US-89: targets the CSV route when the format is csv', () => {
    const url = buildExportUrl({
      format: 'csv',
      from: '2026-06-01',
      to: '2026-06-30',
      allMembers: false,
      memberIds: ['u1'],
      groupBy: 'project',
    });
    expect(url.split('?')[0]).toBe('/api/reports/export.csv');
  });
});

describe('resolveExportGroupBy', () => {
  it('US-89: groups by member for all-members or multi-select, else by project', () => {
    expect(resolveExportGroupBy(true, 0)).toBe('member');
    expect(resolveExportGroupBy(false, 2)).toBe('member');
    expect(resolveExportGroupBy(false, 1)).toBe('project');
    expect(resolveExportGroupBy(false, 0)).toBe('project');
  });
});
