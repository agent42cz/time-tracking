export type NavItem = { href: string; label: string; admin?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: 'Sledování',
    items: [{ href: '/timer', label: 'Stopky' }],
  },
  {
    label: 'Přehledy',
    items: [
      { href: '/dashboard', label: 'Dashboard', admin: true },
      { href: '/reports', label: 'Reporty', admin: true },
    ],
  },
  {
    label: 'Správa dat',
    items: [
      { href: '/clients', label: 'Klienti', admin: true },
      { href: '/tags', label: 'Štítky' },
      { href: '/members', label: 'Členové', admin: true },
    ],
  },
  {
    label: 'Systém',
    items: [
      { href: '/audit', label: 'Audit', admin: true },
      { href: '/trash', label: 'Koš', admin: true },
    ],
  },
  {
    label: 'Účet',
    items: [
      { href: '/extension', label: 'Rozšíření' },
      { href: '/settings', label: 'Nastavení' },
      { href: '/companies', label: 'Firmy' },
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
