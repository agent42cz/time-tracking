'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Badge, Button, EmptyState, Table, THead, Th, Tr, Td } from '@tt/ui';
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
                    onClick={() =>
                      startTransition(async () => {
                        const r = await revokeInviteAction(i.id);
                        if (!r.ok) setError(r.error);
                      })
                    }
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
  );
}

interface MembersManagerProps {
  currentUserId: string;
  memberships: Membership[];
}

export function MembersManager({ currentUserId, memberships }: MembersManagerProps): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
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
                      if (!confirm(`Odebrat ${m.fullName}? Záznamy zůstanou pod jejich jménem.`))
                        return;
                      startTransition(async () => {
                        const r = await removeMemberAction(m.userId);
                        if (!r.ok) setError(r.error);
                      });
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
  );
}
