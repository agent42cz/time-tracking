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

function CompanyRowActions({
  member,
  activeCompanyId,
  pending,
  startTransition,
  setError,
  confirm,
  t,
  className,
}: {
  member: Membership;
  activeCompanyId: string | null;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (e: string | null) => void;
  confirm: ReturnType<typeof useConfirm>;
  t: ReturnType<typeof useTranslations>;
  className: string;
}): ReactElement {
  return (
    <div className={className}>
      {member.companyId !== activeCompanyId ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => startTransition(() => switchCompanyAction(member.companyId))}
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
              title: t('leaveTitle', { name: member.companyName }),
              description: t('leaveDescription'),
            });
            if (!ok) return;
            startTransition(async () => {
              const r = await leaveCompanyAction(member.companyId);
              if (!r.ok) setError(r.error);
            });
          })();
        }}
      >
        Opustit
      </Button>
      {member.role === 'admin' ? (
        <Button
          size="sm"
          variant="danger"
          loading={pending}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: t('deleteTitle', { name: member.companyName }),
                description: t('deleteDescription'),
              });
              if (!ok) return;
              startTransition(async () => {
                const r = await deleteCompanyAction(member.companyId);
                if (r && !r.ok) setError(r.error);
              });
            })();
          }}
        >
          Smazat
        </Button>
      ) : null}
    </div>
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
                  <CompanyRowActions
                    member={m}
                    activeCompanyId={activeCompanyId}
                    pending={pending}
                    startTransition={startTransition}
                    setError={setError}
                    confirm={confirm}
                    t={t}
                    className="flex justify-end gap-2"
                  />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {memberships.map((m) => (
          <li key={m.companyId}>
            <DataCard>
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
                <CompanyRowActions
                  member={m}
                  activeCompanyId={activeCompanyId}
                  pending={pending}
                  startTransition={startTransition}
                  setError={setError}
                  confirm={confirm}
                  t={t}
                  className="flex flex-col gap-2 sm:flex-row"
                />
              </DataCardActions>
            </DataCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
