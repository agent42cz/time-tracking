import type { ReactElement } from 'react';
import Link from 'next/link';
import { Alert, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { AuthPageShell } from '@/components/AuthPageShell';
import { ResetPasswordForm } from './ResetPasswordForm';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<ReactElement> {
  const { token } = await searchParams;
  return (
    <AuthPageShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Time Tracker
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Nastavení nového hesla</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nové heslo</CardTitle>
        </CardHeader>
        <CardBody>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <>
              <Alert tone="danger">V odkazu chybí token. Otevřete novější odkaz z e-mailu.</Alert>
              <p className="mt-3 text-sm">
                <Link href="/login" className="text-zinc-900 dark:text-zinc-100 underline">
                  Zpět na přihlášení
                </Link>
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </AuthPageShell>
  );
}
