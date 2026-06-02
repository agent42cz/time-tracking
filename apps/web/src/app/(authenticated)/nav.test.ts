import { describe, expect, it } from 'vitest';
import { filterVisibleGroups, navGroups, type NavGroup } from './nav.js';

describe('navGroups', () => {
  it('contains all 11 nav items across 5 groups in expected order', () => {
    expect(navGroups.map((g) => g.label)).toEqual([
      'Sledování',
      'Přehledy',
      'Správa dat',
      'Systém',
      'Účet',
    ]);
    const total = navGroups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(11);
  });

  it('lists items in the spec-defined order within each group', () => {
    const byLabel = Object.fromEntries(navGroups.map((g) => [g.label, g.items.map((i) => i.href)]));
    expect(byLabel['Sledování']).toEqual(['/timer']);
    expect(byLabel['Přehledy']).toEqual(['/dashboard', '/reports']);
    expect(byLabel['Správa dat']).toEqual(['/clients', '/tags', '/members']);
    expect(byLabel['Systém']).toEqual(['/audit', '/trash']);
    expect(byLabel['Účet']).toEqual(['/extension', '/settings', '/companies']);
  });
});

describe('filterVisibleGroups', () => {
  it('returns all five groups with all items for admin', () => {
    const result = filterVisibleGroups(navGroups, true);
    expect(result.map((g) => g.label)).toEqual([
      'Sledování',
      'Přehledy',
      'Správa dat',
      'Systém',
      'Účet',
    ]);
    const total = result.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(11);
  });

  it('drops Přehledy and Systém for non-admin (all-admin groups)', () => {
    const result = filterVisibleGroups(navGroups, false);
    expect(result.map((g) => g.label)).toEqual(['Sledování', 'Správa dat', 'Účet']);
  });

  it('keeps Správa dat with only Štítky for non-admin', () => {
    const result = filterVisibleGroups(navGroups, false);
    const data = result.find((g) => g.label === 'Správa dat');
    expect(data?.items.map((i) => i.label)).toEqual(['Štítky']);
  });

  it('keeps Sledování and Účet intact for non-admin', () => {
    const result = filterVisibleGroups(navGroups, false);
    expect(result.find((g) => g.label === 'Sledování')?.items.map((i) => i.href)).toEqual([
      '/timer',
    ]);
    expect(result.find((g) => g.label === 'Účet')?.items.map((i) => i.href)).toEqual([
      '/extension',
      '/settings',
      '/companies',
    ]);
  });

  it('drops a group whose every item is admin-only when caller is not admin', () => {
    const groups: NavGroup[] = [
      { label: 'AllAdmin', items: [{ href: '/x', label: 'X', admin: true }] },
      { label: 'Mixed', items: [{ href: '/y', label: 'Y' }] },
    ];
    expect(filterVisibleGroups(groups, false).map((g) => g.label)).toEqual(['Mixed']);
  });

  it('does not mutate the input array', () => {
    const before = JSON.stringify(navGroups);
    filterVisibleGroups(navGroups, false);
    expect(JSON.stringify(navGroups)).toBe(before);
  });
});
