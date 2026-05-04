'use client';

import type { ReactElement } from 'react';
import { Button, Field, Input, Select } from '@tt/ui';

interface Option {
  id: string;
  name: string;
}
interface Initial {
  from: string;
  to: string;
  clientIds: string[];
  projectIds: string[];
  memberIds: string[];
  tagIds: string[];
  tagsMode: 'and' | 'or';
  search: string;
}

export function ReportFiltersForm({
  isAdmin,
  clients,
  projects,
  members,
  tags,
  initial,
}: {
  isAdmin: boolean;
  clients: Option[];
  projects: Option[];
  members: Option[];
  tags: { id: string; name: string; color: string }[];
  initial: Initial;
}): ReactElement {
  return (
    <form method="get" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Od" htmlFor="from">
          <Input id="from" type="date" name="from" defaultValue={initial.from} />
        </Field>
        <Field label="Do" htmlFor="to">
          <Input id="to" type="date" name="to" defaultValue={initial.to} />
        </Field>
        <Field label="Hledat v popisu" htmlFor="search" className="md:col-span-2">
          <Input id="search" name="search" defaultValue={initial.search} placeholder="text…" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Klienti" hint="Ctrl/Cmd pro více">
          <Select multiple name="client" defaultValue={initial.clientIds} className="h-32">
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Projekty">
          <Select multiple name="project" defaultValue={initial.projectIds} className="h-32">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {isAdmin ? (
          <Field label="Členové">
            <Select multiple name="member" defaultValue={initial.memberIds} className="h-32">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Štítky" hint="Režim filtru níže">
          <Select multiple name="tag" defaultValue={initial.tagIds} className="h-32">
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex items-end gap-3">
        <Field label="Režim štítků" htmlFor="tagsMode">
          <Select id="tagsMode" name="tagsMode" defaultValue={initial.tagsMode}>
            <option value="or">OR — alespoň jeden</option>
            <option value="and">AND — všechny</option>
          </Select>
        </Field>
        <Button type="submit">Použít filtry</Button>
      </div>
    </form>
  );
}
