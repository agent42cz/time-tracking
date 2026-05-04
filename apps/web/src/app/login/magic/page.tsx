import type { ReactElement } from 'react';
import Link from 'next/link';
import { Alert, Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { magicLinkConsumeAction } from '@/lib/actions/auth';

export default async function MagicConsumePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<ReactElement> {
  const { token } = await searchParams;
  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <Card>
          <CardBody>
            <Alert tone="danger">Chybí token.</Alert>
          </CardBody>
        </Card>
      </main>
    );
  }
  const result = await magicLinkConsumeAction(token);
  // On success the action redirects to /timer; this only renders on error.
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Přihlášení odkazem</CardTitle>
          </CardHeader>
          <CardBody>
            <Alert tone="danger">{result.ok ? 'Hotovo' : result.error}</Alert>
            <p className="mt-3 text-sm">
              <Link href="/login" className="text-zinc-900 underline">
                Zpět na přihlášení
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
