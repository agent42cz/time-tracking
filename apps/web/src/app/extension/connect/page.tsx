/**
 * Web-redirect login bridge for the Chrome extension.
 *
 * Flow:
 *   1. Popup opens this URL in a new tab with `?extId=<runtime.id>` and an
 *      optional `?apiBase=<origin>` (defaults to APP_URL on the server).
 *   2. If the user isn't logged in, we redirect to /login?next=...
 *   3. Once authenticated, we mint a fresh server-side session (separate
 *      from the web cookie) and hand the token + apiBase to the extension
 *      via chrome.runtime.sendMessage(extId, ...). The manifest's
 *      `externally_connectable.matches` gates which origins can call it.
 *   4. The bridge component closes the tab when the extension confirms.
 */
import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { Alert, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { createSession } from '@/lib/auth/sessions';
import { prisma, getSession } from '@/lib/session';
import { ConnectBridge } from './ConnectBridge';

export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ extId?: string; apiBase?: string }>;
}): Promise<ReactElement> {
  const sp = await searchParams;
  const extId = sp.extId?.trim() ?? '';
  // Chrome extension IDs are 32 lowercase letters. Reject anything else
  // up front so we never message a bogus target.
  const validExtId = /^[a-p]{32}$/.test(extId);

  const session = await getSession();
  if (!session) {
    const next = `/extension/connect?extId=${encodeURIComponent(extId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!validExtId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Připojení rozšíření</CardTitle>
            </CardHeader>
            <CardBody>
              <Alert tone="danger">
                Neplatný odkaz — chybí identifikátor rozšíření. Zkuste to znovu z popupu.
              </Alert>
            </CardBody>
          </Card>
        </div>
      </main>
    );
  }

  const fresh = await createSession(prisma(), session.userId);
  const apiBase =
    (sp.apiBase && sp.apiBase.startsWith('http') ? sp.apiBase : null) ??
    process.env.APP_URL ??
    'http://localhost:3000';

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Time Tracker
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Připojení rozšíření</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Propojení s rozšířením</CardTitle>
          </CardHeader>
          <CardBody>
            <ConnectBridge
              extId={extId}
              token={fresh.token}
              expiresAt={fresh.expiresAt.toISOString()}
              apiBase={apiBase}
              email={session.email}
            />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
