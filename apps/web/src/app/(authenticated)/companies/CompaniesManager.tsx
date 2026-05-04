'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import {
  Alert,
  Badge,
  Button,
  Field,
  FieldGroup,
  Input,
  Table,
  THead,
  Th,
  Tr,
  Td,
} from '@tt/ui';
import {
  createCompanyAction,
  deleteCompanyAction,
  leaveCompanyAction,
} from '@/lib/actions/companies';
import { switchCompanyAction } from '@/lib/actions/auth';

interface Membership {
  companyId: string;
  companyName: string;
  companySlug: string;
  role: 'admin' | 'user';
}

export function CreateCompanyForm(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await createCompanyAction(fd);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <FieldGroup>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Název firmy" htmlFor="name">
          <Input id="name" name="name" required />
        </Field>
        <Button type="submit" loading={pending}>
          Vytvořit firmu
        </Button>
      </FieldGroup>
    </form>
  );
}

interface ManagerProps {
  activeCompanyId: string | null;
  memberships: Membership[];
}

export function CompaniesManager({
  activeCompanyId,
  memberships,
}: ManagerProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      {error ? <Alert tone="danger" className="mb-3">{error}</Alert> : null}
      <Table>
        <THead>
          <tr>
            <Th>Název</Th>
            <Th>Role</Th>
            <Th>Stav</Th>
            <Th className="text-right">Akce</Th>
          </tr>
        </THead>
        <tbody>
          {memberships.map((m) => (
            <Tr key={m.companyId}>
              <Td className="font-medium">{m.companyName}</Td>
              <Td>
                <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                  {m.role === 'admin' ? 'Správce' : 'Člen'}
                </Badge>
              </Td>
              <Td>
                {m.companyId === activeCompanyId ? (
                  <Badge tone="success">aktivní</Badge>
                ) : (
                  <span className="text-sm text-zinc-500">—</span>
                )}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  {m.companyId !== activeCompanyId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() =>
                        startTransition(() => switchCompanyAction(m.companyId))
                      }
                    >
                      Přepnout
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => {
                      if (!confirm(`Opustit firmu „${m.companyName}"?`)) return;
                      startTransition(async () => {
                        const r = await leaveCompanyAction(m.companyId);
                        if (!r.ok) setError(r.error);
                      });
                    }}
                  >
                    Opustit
                  </Button>
                  {m.role === 'admin' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Smazat firmu „${m.companyName}" včetně všech dat? Akce je nevratná.`,
                          )
                        )
                          return;
                        startTransition(async () => {
                          const r = await deleteCompanyAction(m.companyId);
                          if (r && !r.ok) setError(r.error);
                        });
                      }}
                    >
                      Smazat
                    </Button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

