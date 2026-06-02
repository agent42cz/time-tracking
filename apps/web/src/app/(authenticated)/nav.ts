export type NavIcon =
  | 'timer'
  | 'reports'
  | 'clients'
  | 'members'
  | 'tags'
  | 'dashboard'
  | 'settings'
  | 'companies'
  | 'audit'
  | 'trash'
  | 'extension';

export type NavItem = { href: string; label: string; admin?: boolean; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  { label: 'Sledování', items: [{ href: '/timer', label: 'Stopky', icon: 'timer' }] },
  {
    label: 'Přehledy',
    items: [
      { href: '/dashboard', label: 'Dashboard', admin: true, icon: 'dashboard' },
      { href: '/reports', label: 'Reporty', admin: true, icon: 'reports' },
    ],
  },
  {
    label: 'Správa dat',
    items: [
      { href: '/clients', label: 'Klienti', admin: true, icon: 'clients' },
      { href: '/tags', label: 'Štítky', icon: 'tags' },
      { href: '/members', label: 'Členové', admin: true, icon: 'members' },
    ],
  },
  {
    label: 'Systém',
    items: [
      { href: '/audit', label: 'Audit', admin: true, icon: 'audit' },
      { href: '/trash', label: 'Koš', admin: true, icon: 'trash' },
    ],
  },
  {
    label: 'Účet',
    items: [
      { href: '/extension', label: 'Rozšíření', icon: 'extension' },
      { href: '/settings', label: 'Nastavení', icon: 'settings' },
      { href: '/companies', label: 'Firmy', icon: 'companies' },
    ],
  },
];

export function filterVisibleGroups(groups: NavGroup[], isAdmin: boolean): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.admin || isAdmin),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Priority order for the mobile bottom tab bar (highest first). The bar shows
 * the first 4 *visible* (role-filtered) items; the rest fall into the More sheet.
 */
export const BOTTOM_BAR_ORDER: string[] = [
  '/timer',
  '/reports',
  '/clients',
  '/members',
  '/tags',
  '/dashboard',
  '/settings',
  '/companies',
  '/audit',
  '/trash',
  '/extension',
];

export function getBottomTabs(isAdmin: boolean): NavItem[] {
  const visible = filterVisibleGroups(navGroups, isAdmin).flatMap((g) => g.items);
  const byHref = new Map(visible.map((i) => [i.href, i]));
  return BOTTOM_BAR_ORDER.map((href) => byHref.get(href))
    .filter((i): i is NavItem => Boolean(i))
    .slice(0, 4);
}

export function getMoreGroups(isAdmin: boolean): NavGroup[] {
  const primary = new Set(getBottomTabs(isAdmin).map((i) => i.href));
  return filterVisibleGroups(navGroups, isAdmin)
    .map((group) => ({ ...group, items: group.items.filter((i) => !primary.has(i.href)) }))
    .filter((group) => group.items.length > 0);
}
