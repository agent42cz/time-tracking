import type { ReactElement } from 'react';
import { Alert, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { LoginForms } from './LoginForms';

const MAGIC_ERROR_MESSAGES: Record<string, string> = {
  missing: 'V odkazu chybí token. Otevřete novější odkaz z e-mailu.',
  invalid: 'Odkaz je neplatný nebo už vypršel. Pošlete si nový.',
  totp: 'Tento účet má zapnuté 2FA — přihlaste se heslem a kódem z aplikace.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; magic_error?: string }>;
}): Promise<ReactElement> {
  const { next, magic_error: magicError } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const magicErrorMessage = magicError ? MAGIC_ERROR_MESSAGES[magicError] : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Time Tracker
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Sledování času pro Agent42
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Přihlášení</CardTitle>
          </CardHeader>
          <CardBody>
            {magicErrorMessage ? (
              <div className="mb-4">
                <Alert tone="danger">{magicErrorMessage}</Alert>
              </div>
            ) : null}
            <LoginForms next={safeNext} />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
