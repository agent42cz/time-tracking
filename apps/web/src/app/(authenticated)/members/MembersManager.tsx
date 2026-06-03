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
  EmptyState,
  Table,
  THead,
  Th,
  Tr,
  Td,
  useConfirm,
} from '@tt/ui';
import { useTranslations } from 'next-intl';
import {
  changeRoleAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
} from '@/lib/actions/companies';

interface Membership {
  userId: string;
  fullName: string;
  email: string;
  role: 'admin' | 'user';
  joinedAt: string;
}
interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'user';
  expiresAt: string;
}

export function PendingInvites({ invites }: { invites: Invite[] }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const t = useTranslations('members.confirm');
  if (invites.length === 0) {
    return <EmptyState title="Žádné čekající pozvánky" />;
  }
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
              <Th>E-mail</Th>
              <Th>Role</Th>
              <Th>Vyprší</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {invites.map((i) => (
              <Tr key={i.id}>
                <Td>{i.email}</Td>
                <Td>
                  <Badge tone={i.role === 'admin' ? 'info' : 'neutral'}>
                    {i.role === 'admin' ? 'Správce' : 'Člen'}
                  </Badge>
                </Td>
                <Td>{new Date(i.expiresAt).toLocaleDateString('cs-CZ')}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await resendInviteAction(i.id);
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      Odeslat znovu
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('revokeInviteTitle'),
                            description: t('revokeInviteDescription', { email: i.email }),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await revokeInviteAction(i.id);
                            if (!r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Zrušit
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {invites.map((i) => (
          <DataCard key={i.id}>
            <DataCardRow label="E-mail">{i.email}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={i.role === 'admin' ? 'info' : 'neutral'}>
                {i.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Vyprší">
              {new Date(i.expiresAt).toLocaleDateString('cs-CZ')}
            </DataCardRow>
            <DataCardActions>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await resendInviteAction(i.id);
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  Odeslat znovu
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('revokeInviteTitle'),
                        description: t('revokeInviteDescription', { email: i.email }),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await revokeInviteAction(i.id);
                        if (!r.ok) setError(r.error);
                      });
                    })();
                  }}
                >
                  Zrušit
                </Button>
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
    </div>
  );
}

interface MembersManagerProps {
  currentUserId: string;
  memberships: Membership[];
}

export function MembersManager({ currentUserId, memberships }: MembersManagerProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const t = useTranslations('members.confirm');

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
              <Th>Jméno</Th>
              <Th>E-mail</Th>
              <Th>Role</Th>
              <Th>Připojen</Th>
              <Th className="text-right">Akce</Th>
            </tr>
          </THead>
          <tbody>
            {memberships.map((m) => (
              <Tr key={m.userId}>
                <Td className="font-medium">{m.fullName}</Td>
                <Td className="text-zinc-600 dark:text-zinc-400">{m.email}</Td>
                <Td>
                  <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                    {m.role === 'admin' ? 'Správce' : 'Člen'}
                  </Badge>
                </Td>
                <Td className="text-zinc-600 dark:text-zinc-400">
                  {new Date(m.joinedAt).toLocaleDateString('cs-CZ')}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      disabled={m.userId === currentUserId && m.role === 'admin'}
                      title={
                        m.userId === currentUserId && m.role === 'admin'
                          ? 'Nemůžete degradovat sami sebe'
                          : undefined
                      }
                      onClick={() =>
                        startTransition(async () => {
                          const r = await changeRoleAction(
                            m.userId,
                            m.role === 'admin' ? 'user' : 'admin',
                          );
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      {m.role === 'admin' ? 'Degradovat' : 'Povýšit'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending}
                      disabled={m.userId === currentUserId}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: t('removeTitle'),
                            description: t('removeDescription', { name: m.fullName }),
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const r = await removeMemberAction(m.userId);
                            if (!r.ok) setError(r.error);
                          });
                        })();
                      }}
                    >
                      Odebrat
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {memberships.map((m) => (
          <DataCard key={m.userId}>
            <DataCardRow label="Jméno">{m.fullName}</DataCardRow>
            <DataCardRow label="E-mail">{m.email}</DataCardRow>
            <DataCardRow label="Role">
              <Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>
                {m.role === 'admin' ? 'Správce' : 'Člen'}
              </Badge>
            </DataCardRow>
            <DataCardRow label="Připojen">
              {new Date(m.joinedAt).toLocaleDateString('cs-CZ')}
            </DataCardRow>
            <DataCardActions>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  disabled={m.userId === currentUserId && m.role === 'admin'}
                  title={
                    m.userId === currentUserId && m.role === 'admin'
                      ? 'Nemůžete degradovat sami sebe'
                      : undefined
                  }
                  onClick={() =>
                    startTransition(async () => {
                      const r = await changeRoleAction(
                        m.userId,
                        m.role === 'admin' ? 'user' : 'admin',
                      );
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  {m.role === 'admin' ? 'Degradovat' : 'Povýšit'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pending}
                  disabled={m.userId === currentUserId}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('removeTitle'),
                        description: t('removeDescription', { name: m.fullName }),
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const r = await removeMemberAction(m.userId);
                        if (!r.ok) setError(r.error);
                      });
                    })();
                  }}
                >
                  Odebrat
                </Button>
              </div>
            </DataCardActions>
          </DataCard>
        ))}
      </ul>
    </div>
  );
}
