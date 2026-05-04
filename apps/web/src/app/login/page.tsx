import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { LoginForms } from './LoginForms';

export default function LoginPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Time Tracker</h1>
          <p className="mt-1 text-sm text-zinc-600">Sledování času pro Agent42</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Přihlášení</CardTitle>
          </CardHeader>
          <CardBody>
            <LoginForms />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
