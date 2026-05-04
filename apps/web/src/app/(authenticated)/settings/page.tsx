import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { requireUser } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { ChangePasswordForm } from './ChangePasswordForm';
import { TotpManager } from './TotpManager';

export default async function SettingsPage(): Promise<ReactElement> {
  const session = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="Nastavení" />
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-zinc-500">Jméno: </span>
              <span className="font-medium">{session.fullName}</span>
            </div>
            <div>
              <span className="text-zinc-500">E-mail: </span>
              <span className="font-medium">{session.email}</span>
            </div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Změna hesla</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Dvoufaktorové ověření (TOTP)</CardTitle>
        </CardHeader>
        <CardBody>
          <TotpManager enabled={session.totpEnabled} />
        </CardBody>
      </Card>
    </div>
  );
}
