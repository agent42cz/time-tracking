export interface FilterProject {
  id: string;
  name: string;
  archived: boolean;
}

export interface FilterClient {
  id: string;
  name: string;
  archived: boolean;
  projects: FilterProject[];
}

export interface FilterResult<T extends FilterClient> {
  visible: T[];
  autoExpanded: Set<string>;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterClients<T extends FilterClient>(
  clients: T[],
  query: string,
): FilterResult<T> {
  const q = normalize(query.trim());
  if (q.length === 0) {
    return { visible: clients, autoExpanded: new Set() };
  }

  const visible: T[] = [];
  const autoExpanded = new Set<string>();

  for (const c of clients) {
    const nameMatches = normalize(c.name).includes(q);
    const matchingProjects = c.projects.filter((p) => normalize(p.name).includes(q));

    if (nameMatches) {
      visible.push(c);
    } else if (matchingProjects.length > 0) {
      visible.push({ ...c, projects: matchingProjects });
      autoExpanded.add(c.id);
    }
  }

  return { visible, autoExpanded };
}
