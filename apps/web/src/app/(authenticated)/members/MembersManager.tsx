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

function InviteRowActions({
  invite,
  pending,
  startTransition,
  setError,
  confirm,
  t,
  className,
}: {
  invite: Invite;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (e: string | null) => void;
  confirm: ReturnType<typeof useConfirm>;
  t: ReturnType<typeof useTranslations>;
  className: string;
}): ReactElement {
  return (
    <div className={className}>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await resendInviteAction(invite.id);
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
              description: t('revokeInviteDescription', { email: invite.email }),
            });
            if (!ok) return;
            startTransition(async () => {
              const r = await revokeInviteAction(invite.id);
              if (!r.ok) setError(r.error);
            });
          })();
        }}
      >
        Zrušit
      </Button>
    </div>
  );
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
                  <InviteRowActions
                    invite={i}
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
        {invites.map((i) => (
          <li key={i.id}>
            <DataCard>
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
                <InviteRowActions
                  invite={i}
                  pending={pending}
                  startTransition={startTransition}
                  setError={setError}
                  confirm={confirm}
                  t={t}
                  className="flex gap-2"
                />
              </DataCardActions>
            </DataCard>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberRowActions({
  member,
  currentUserId,
  pending,
  startTransition,
  setError,
  confirm,
  t,
  className,
}: {
  member: Membership;
  currentUserId: string;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (e: string | null) => void;
  confirm: ReturnType<typeof useConfirm>;
  t: ReturnType<typeof useTranslations>;
  className: string;
}): ReactElement {
  return (
    <div className={className}>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        disabled={member.userId === currentUserId && member.role === 'admin'}
        title={
          member.userId === currentUserId && member.role === 'admin'
            ? 'Nemůžete degradovat sami sebe'
            : undefined
        }
        onClick={() =>
          startTransition(async () => {
            const r = await changeRoleAction(
              member.userId,
              member.role === 'admin' ? 'user' : 'admin',
            );
            if (!r.ok) setError(r.error);
          })
        }
      >
        {member.role === 'admin' ? 'Degradovat' : 'Povýšit'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        disabled={member.userId === currentUserId}
        onClick={() => {
          void (async () => {
            const ok = await confirm({
              title: t('removeTitle'),
              description: t('removeDescription', { name: member.fullName }),
            });
            if (!ok) return;
            startTransition(async () => {
              const r = await removeMemberAction(member.userId);
              if (!r.ok) setError(r.error);
            });
          })();
        }}
      >
        Odebrat
      </Button>
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
                  <MemberRowActions
                    member={m}
                    currentUserId={currentUserId}
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
          <li key={m.userId}>
            <DataCard>
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
                <MemberRowActions
                  member={m}
                  currentUserId={currentUserId}
                  pending={pending}
                  startTransition={startTransition}
                  setError={setError}
                  confirm={confirm}
                  t={t}
                  className="flex gap-2"
                />
              </DataCardActions>
            </DataCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
