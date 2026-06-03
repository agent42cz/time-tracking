'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import {
  Alert,
  Badge,
  Button,
  DataCard,
  DataCardRow,
  DataCardActions,
  Field,
  FieldGroup,
  Input,
  Table,
  THead,
  Th,
  Tr,
  Td,
  useConfirm,
} from '@tt/ui';
import { useTranslations } from 'next-intl';
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

export function CompaniesManager({ activeCompanyId, memberships }: ManagerProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const t = useTranslations('companies.confirm');
  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <div className="hidden md:block">
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
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {m.companyId !== activeCompanyId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() => startTransition(() => switchCompanyAction(m.companyId))}
                      >
                        Přepnout
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('leaveTitle', { name: m.companyName }),
                            description: t('leaveDescription'),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await leaveCompanyAction(m.companyId);
                            if (!r.ok) setError(r.error);
                          });
                        })();
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
                          void (async () => {
                            const ok = await confirm({
                              title: t('deleteTitle', { name: m.companyName }),
                              description: t('deleteDescription'),
                            });
                            if (!ok) return;
                            startTransition(async () => {
                              const r = await deleteCompanyAction(m.companyId);
                              if (r && !r.ok) setError(r.error);
                            });
                          })();
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
      <ul className="space-y-3 md:hidden">
        {memberships.map((m) => (
          <DataCard key={m.companyId}>
            <DataCardRow label="Název">{m.companyName}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                {m.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Stav">
              {m.companyId === activeCompanyId ? (
                <Badge tone="success">aktivní</Badge>
              ) : (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">—</span>
              )}
            </DataCardRow>
            <DataCardActions>
              <div className="flex flex-col gap-2 sm:flex-row">
                {m.companyId !== activeCompanyId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => startTransition(() => switchCompanyAction(m.companyId))}
                  >
                    Přepnout
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('leaveTitle', { name: m.companyName }),
                        description: t('leaveDescription'),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await leaveCompanyAction(m.companyId);
                        if (!r.ok) setError(r.error);
                      });
                    })();
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
                      void (async () => {
                        const ok = await confirm({
                          title: t('deleteTitle', { name: m.companyName }),
                          description: t('deleteDescription'),
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const r = await deleteCompanyAction(m.companyId);
                          if (r && !r.ok) setError(r.error);
                        });
                      })();
                    }}
                  >
                    Smazat
                  </Button>
                ) : null}
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
    </div>
  );
}
