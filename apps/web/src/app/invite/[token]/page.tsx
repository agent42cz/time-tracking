import type { ReactElement } from 'react';
import { Alert, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { loadInviteByToken } from '@/lib/auth/signup';
import { getSession, prisma } from '@/lib/session';
import { InviteAcceptForm } from './InviteAcceptForm';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  const loaded = await loadInviteByToken(prisma(), token);
  const session = await getSession();
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Pozvánka do firmy</CardTitle>
          </CardHeader>
          <CardBody>
            {!loaded.ok ? (
              <Alert tone="danger">
                {loaded.reason === 'expired'
                  ? 'Platnost pozvánky vypršela.'
                  : loaded.reason === 'revoked'
                    ? 'Pozvánka byla zrušena.'
                    : loaded.reason === 'already_accepted'
                      ? 'Tato pozvánka již byla použita.'
                      : 'Pozvánka nebyla nalezena.'}
              </Alert>
            ) : (
              <InviteAcceptForm
                token={token}
                email={loaded.invite.email}
                role={loaded.invite.role}
                isLoggedIn={!!session}
                loggedEmail={session?.email ?? null}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
