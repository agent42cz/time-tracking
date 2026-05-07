# CLIENTS-03 — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ClientsManager.tsx` by extracting per-row markup and a pure search filter helper, then wire `SearchInput` (from [CLIENTS-02](../CLIENTS-02/assignment.md)) above the list. Search filters clients and projects together; matching a project name auto-expands its parent client.

**Architecture:** Pull row JSX into `ClientRow.tsx` and `ProjectRow.tsx` (preserves orchestrator focus). Add a pure `filterClients.ts` helper backed by Vitest unit tests (matches the `nav.ts` / `nav.test.ts` pattern from SIDEBAR-01). Manager becomes a state coordinator that merges manual `openClient` with search-driven `autoExpanded`. Move the "Seznam" title from `page.tsx`'s `<CardHeader>` into the manager's own header row so it can sit alongside the SearchInput.

**Tech Stack:** React 19, Tailwind, `next-intl` for Czech strings, Vitest (node env, no React Testing Library — same pattern as `nav.test.ts`).

**Spec deviation:** None.

**Spec:** [`assignment.md`](assignment.md)

---

## File structure

| File                                                             | Status | Responsibility                                                          |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/web/src/app/(authenticated)/clients/filterClients.ts`      | Create | Pure search helper                                                      |
| `apps/web/src/app/(authenticated)/clients/filterClients.test.ts` | Create | Unit tests, node env                                                    |
| `apps/web/src/app/(authenticated)/clients/ClientRow.tsx`         | Create | One client row + expanded body                                          |
| `apps/web/src/app/(authenticated)/clients/ProjectRow.tsx`        | Create | One project row                                                         |
| `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`    | Modify | Orchestrator — state, layout, action handling, ConfirmModal, header row |
| `apps/web/src/app/(authenticated)/clients/page.tsx`              | Modify | Drop the CardHeader (manager owns the header now)                       |
| `apps/web/messages/cs.json`                                      | Modify | Add `clients.search.*` strings + `audit.action.reorder` label           |

---

## Task 1: Pure `filterClients` helper with tests

**Files:**

- Create: `apps/web/src/app/(authenticated)/clients/filterClients.ts`
- Create: `apps/web/src/app/(authenticated)/clients/filterClients.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/app/(authenticated)/clients/filterClients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterClients, type FilterClient } from './filterClients.js';

const seed: FilterClient[] = [
  {
    id: 'c1',
    name: 'Agent 42',
    archived: false,
    projects: [
      { id: 'p1', name: 'Google Work Space', archived: false },
      { id: 'p2', name: 'Instalace agenta', archived: false },
    ],
  },
  {
    id: 'c2',
    name: 'Agént Diakritika',
    archived: false,
    projects: [{ id: 'p3', name: 'Web', archived: false }],
  },
  {
    id: 'c3',
    name: 'Old Co',
    archived: true,
    projects: [{ id: 'p4', name: 'Sunset', archived: true }],
  },
];

describe('filterClients', () => {
  it('US-51: empty query returns all clients visible, none auto-expanded', () => {
    const r = filterClients(seed, '');
    expect(r.visible.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(r.autoExpanded.size).toBe(0);
  });

  it('US-51: matching a client name keeps the client and all its projects visible', () => {
    const r = filterClients(seed, 'agent 42');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
    expect(r.visible[0]!.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(r.autoExpanded.has('c1')).toBe(false);
  });

  it('US-51: matching a project name auto-expands the parent and includes only matching projects', () => {
    const r = filterClients(seed, 'instalace');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
    expect(r.visible[0]!.projects.map((p) => p.id)).toEqual(['p2']);
    expect(r.autoExpanded.has('c1')).toBe(true);
  });

  it('US-51: search is diacritic-insensitive ("agent" matches "Agént")', () => {
    const r = filterClients(seed, 'agent');
    expect(r.visible.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('US-51: search is case-insensitive', () => {
    const r = filterClients(seed, 'AGENT 42');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
  });

  it('US-51: archived clients participate in search results', () => {
    const r = filterClients(seed, 'sunset');
    expect(r.visible.map((c) => c.id)).toEqual(['c3']);
    expect(r.autoExpanded.has('c3')).toBe(true);
  });

  it('US-51: filter does not mutate input', () => {
    const before = JSON.stringify(seed);
    filterClients(seed, 'agent');
    expect(JSON.stringify(seed)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @tt/web test -- filterClients
```

Expected: cannot resolve `./filterClients.js`.

- [ ] **Step 3: Implement the helper**

`apps/web/src/app/(authenticated)/clients/filterClients.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter @tt/web test -- filterClients
```

Expected: 7 cases pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @tt/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/clients/filterClients.ts apps/web/src/app/\(authenticated\)/clients/filterClients.test.ts
git commit -m "feat(web): pure filterClients helper for client/project search"
```

---

## Task 2: Add Czech strings to `cs.json`

**Files:**

- Modify: `apps/web/messages/cs.json`

- [ ] **Step 1: Read current `cs.json` and find the right insertion point**

```bash
grep -n "\"audit\"\\|\"clients\"" apps/web/messages/cs.json
```

If a `clients` namespace exists, extend it; otherwise add one. Same for `audit`.

- [ ] **Step 2: Add the search and audit keys**

Merge into `apps/web/messages/cs.json` (placement adjacent to existing `clients` or `audit` namespaces — pick the cleaner location):

```json
{
  "clients": {
    "search": {
      "placeholder": "Hledat klienta nebo projekt",
      "ariaLabel": "Hledat klienta nebo projekt",
      "clearAriaLabel": "Vymazat hledání",
      "empty": "Žádné výsledky",
      "disabledDrag": "Vyhledávání je aktivní – zrušte ho pro řazení."
    }
  },
  "audit": {
    "action": {
      "reorder": "změna pořadí"
    }
  }
}
```

If those namespaces already exist with other keys, merge instead of replacing. Validate by:

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/cs.json', 'utf8'))"
```

(Should print nothing — silent success.)

- [ ] **Step 3: Update the audit log row component to read the new label**

Find any place that renders `AuditAction` values to humans:

```bash
grep -rn "AuditAction\\|action.create\\|action.update" apps/web/src
```

If a switch/lookup turns `action` into a Czech string, add a `reorder` branch. If the lookup is data-driven (i.e., `t(\`audit.action.\${action}\`)`), no code change — just the cs.json key suffices.

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/messages/cs.json apps/web/src
git commit -m "feat(web): czech strings for client search and reorder audit label"
```

---

## Task 3: Extract `ProjectRow` and `ClientRow` from `ClientsManager`

**Files:**

- Create: `apps/web/src/app/(authenticated)/clients/ProjectRow.tsx`
- Create: `apps/web/src/app/(authenticated)/clients/ClientRow.tsx`
- Modify: `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`

This task is a pure refactor — no behavior change. Search wiring comes in Task 4.

- [ ] **Step 1: Create `ProjectRow.tsx`**

`apps/web/src/app/(authenticated)/clients/ProjectRow.tsx`:

```tsx
'use client';

import type { ReactElement } from 'react';
import { Badge, Button } from '@tt/ui';

export interface ProjectRowItem {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
}

export interface ProjectRowProps {
  project: ProjectRowItem;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectRow({ project, onArchive, onDelete }: ProjectRowProps): ReactElement {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={
            project.archived
              ? 'text-zinc-400 dark:text-zinc-500'
              : 'text-zinc-800 dark:text-zinc-200'
          }
        >
          {project.name}
        </span>
        {project.archived ? <Badge tone="warning">archivováno</Badge> : null}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          ({project.entryCount} záznamů)
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={onArchive}>
          {project.archived ? 'Obnovit' : 'Archivovat'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Smazat projekt">
          ✕
        </Button>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Create `ClientRow.tsx`**

`apps/web/src/app/(authenticated)/clients/ClientRow.tsx`:

```tsx
'use client';

import type { FormEvent, ReactElement } from 'react';
import { Badge, Button, Input } from '@tt/ui';
import { ProjectRow, type ProjectRowItem } from './ProjectRow';

export interface ClientRowItem {
  id: string;
  name: string;
  archived: boolean;
  entryCount: number;
  projects: ProjectRowItem[];
}

export interface ClientRowProps {
  client: ClientRowItem;
  isOpen: boolean;
  pending: boolean;
  onToggle: () => void;
  onArchiveClient: () => void;
  onDeleteClient: () => void;
  onArchiveProject: (project: ProjectRowItem) => void;
  onDeleteProject: (project: ProjectRowItem) => void;
  onAddProject: (e: FormEvent<HTMLFormElement>) => void;
}

export function ClientRow({
  client,
  isOpen,
  pending,
  onToggle,
  onArchiveClient,
  onDeleteClient,
  onArchiveProject,
  onDeleteProject,
  onAddProject,
}: ClientRowProps): ReactElement {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={onToggle}
            aria-label="Rozbalit projekty"
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <span
            className={`font-medium ${
              client.archived
                ? 'text-zinc-400 dark:text-zinc-500'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {client.name}
          </span>
          {client.archived ? <Badge tone="warning">archivováno</Badge> : null}
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            ({client.projects.length} projektů, {client.entryCount} záznamů)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onArchiveClient}>
            {client.archived ? 'Obnovit' : 'Archivovat'}
          </Button>
          <Button size="sm" variant="danger" onClick={onDeleteClient}>
            Smazat
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-3 ml-7 space-y-3 border-l border-zinc-100 dark:border-zinc-800/60 pl-4">
          <ul className="space-y-1.5">
            {client.projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onArchive={() => onArchiveProject(p)}
                onDelete={() => onDeleteProject(p)}
              />
            ))}
          </ul>
          <form onSubmit={onAddProject} className="flex gap-2">
            <Input name="name" placeholder="Nový projekt" />
            <Button type="submit" size="sm" loading={pending}>
              Přidat projekt
            </Button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 3: Refactor `ClientsManager.tsx` to use the new components**

Open `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`. Replace the inline `<li key={c.id} ...>` block in the `clients.map` with a `<ClientRow>` invocation, passing the existing handlers as props. Keep all state, action plumbing, ConfirmModal, and `runAction` exactly as-is.

The relevant section becomes:

```tsx
import { ClientRow } from './ClientRow';
import type { ProjectRowItem } from './ProjectRow';

// inside the component, replace the inline <li>:
<ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
  {clients.map((c) => (
    <ClientRow
      key={c.id}
      client={c}
      isOpen={openClient === c.id}
      pending={pending}
      onToggle={() => setOpenClient(openClient === c.id ? null : c.id)}
      onArchiveClient={() => setAction({ kind: 'archive-client', client: c })}
      onDeleteClient={() => setAction({ kind: 'delete-client', client: c })}
      onArchiveProject={(p) => setAction({ kind: 'archive-project', project: p })}
      onDeleteProject={(p) => setAction({ kind: 'delete-project', project: p })}
      onAddProject={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('clientId', c.id);
        setError(null);
        startTransition(async () => {
          const r = await createProjectAction(fd);
          if (!r.ok) setError(r.error);
          else (e.target as HTMLFormElement).reset();
        });
      }}
    />
  ))}
</ul>;
```

The local `Client` and `Project` types in `ClientsManager.tsx` should align with `ClientRowItem` / `ProjectRowItem` — replace the local interfaces with imports from `./ClientRow` / `./ProjectRow`, or re-export them from there.

- [ ] **Step 4: Typecheck, lint, test, build**

```bash
pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test && pnpm --filter @tt/web build
```

All exit 0.

- [ ] **Step 5: Manual smoke**

```bash
pnpm --filter @tt/web dev
```

Visit `/clients` as admin. Confirm the page renders identically to before, expand/collapse works, archive/delete buttons trigger the ConfirmModal, "Přidat projekt" still adds projects.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/clients
git commit -m "refactor(web): extract ClientRow and ProjectRow from ClientsManager"
```

---

## Task 4: Wire `SearchInput` and search filtering into `ClientsManager`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`
- Modify: `apps/web/src/app/(authenticated)/clients/page.tsx`

- [ ] **Step 1: Drop `CardHeader` from `page.tsx`**

`apps/web/src/app/(authenticated)/clients/page.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Card, CardBody } from '@tt/ui';
import { prisma, requireAdmin } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { ClientsManager } from './ClientsManager';

export default async function ClientsPage(): Promise<ReactElement> {
  const s = await requireAdmin();
  const clients = await prisma().client.findMany({
    where: { companyId: s.activeCompanyId },
    include: {
      projects: {
        orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { timeEntries: true } } },
      },
      _count: { select: { timeEntries: true } },
    },
    orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return (
    <div>
      <PageHeader
        title="Klienti a projekty"
        description="Spravujte seznam klientů a jejich projektů."
      />
      <Card>
        <CardBody>
          <ClientsManager
            clients={clients.map((c) => ({
              id: c.id,
              name: c.name,
              archived: c.archived,
              entryCount: c._count.timeEntries,
              projects: c.projects.map((p) => ({
                id: p.id,
                name: p.name,
                archived: p.archived,
                entryCount: p._count.timeEntries,
              })),
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
```

(Removed `CardHeader` and `CardTitle` imports since the manager now owns the header.)

- [ ] **Step 2: Add the header row + search wiring inside `ClientsManager`**

In `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx`:

```tsx
'use client';

import { useMemo, useState, useTransition, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { Alert, ConfirmModal, Field, FieldGroup, Input, Button, SearchInput } from '@tt/ui';
import { ClientRow, type ClientRowItem } from './ClientRow';
import type { ProjectRowItem } from './ProjectRow';
import { filterClients } from './filterClients';
// ...existing imports for actions and the PendingAction type
```

Inside the component:

```tsx
const t = useTranslations('clients.search');
const [query, setQuery] = useState('');
const { visible, autoExpanded } = useMemo(() => filterClients(clients, query), [clients, query]);
```

Replace the existing top of the JSX (the bit before `<form>` for "Nový klient") with this header row. Keep the existing alert / new-client form / ConfirmModal in place; only the wrapping changes:

```tsx
return (
  <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Seznam</h2>
      <div className="w-72 max-w-full">
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel={t('ariaLabel')}
          clearAriaLabel={t('clearAriaLabel')}
          placeholder={t('placeholder')}
        />
      </div>
    </div>

    {error ? <Alert tone="danger">{error}</Alert> : null}

    {/* existing "Nový klient" form unchanged */}
    {/* ... */}

    {/* list */}
    {visible.length === 0 ? (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('empty')}</p>
    ) : (
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {visible.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            isOpen={autoExpanded.has(c.id) || openClient === c.id}
            pending={pending}
            onToggle={() => setOpenClient(openClient === c.id ? null : c.id)}
            onArchiveClient={() => setAction({ kind: 'archive-client', client: c })}
            onDeleteClient={() => setAction({ kind: 'delete-client', client: c })}
            onArchiveProject={(p) => setAction({ kind: 'archive-project', project: p })}
            onDeleteProject={(p) => setAction({ kind: 'delete-project', project: p })}
            onAddProject={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set('clientId', c.id);
              setError(null);
              startTransition(async () => {
                const r = await createProjectAction(fd);
                if (!r.ok) setError(r.error);
                else (e.target as HTMLFormElement).reset();
              });
            }}
          />
        ))}
      </ul>
    )}

    <ConfirmModal {/* unchanged */} />
  </div>
);
```

- [ ] **Step 3: Confirm `useTranslations` is already configured for `next-intl`**

```bash
grep -rn "NextIntlClientProvider\\|useTranslations" apps/web/src | head
```

If `useTranslations` is in use elsewhere with namespace dot-paths, the `useTranslations('clients.search')` call will work. If the project loads messages differently, mirror that pattern. Either way, the keys live in `cs.json` from Task 2.

- [ ] **Step 4: Typecheck, lint, test, build**

```bash
pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test && pnpm --filter @tt/web build
```

All green.

- [ ] **Step 5: Manual smoke**

```bash
pnpm --filter @tt/web dev
```

Visit `/clients` as admin. Confirm:

- "Seznam" sits left, search input sits right.
- Typing "agent" filters the list.
- Typing a project name auto-expands the parent client and shows only matching projects.
- Clearing search restores the full list and collapses any auto-expanded clients (manual `openClient` state is preserved).
- Esc in the search input clears it.
- Empty results show "Žádné výsledky".

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/clients/ClientsManager.tsx apps/web/src/app/\(authenticated\)/clients/page.tsx
git commit -m "feat(web): search and auto-expand on /clients"
```

---

## Verification summary

After all four tasks:

```bash
pnpm --filter @tt/web typecheck && \
  pnpm --filter @tt/web lint && \
  pnpm --filter @tt/web test && \
  pnpm --filter @tt/web build
```

All exit 0. The page now has a working search above the list, with auto-expand on project matches, diacritic- and case-insensitive matching, Esc-to-clear, and a graceful empty state. Drag-and-drop comes in [CLIENTS-04](../CLIENTS-04/assignment.md).

## Changelog

Filled in after merge in [`changelog.md`](changelog.md).
