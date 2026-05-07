import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { requireUser } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { ChangePasswordForm } from './ChangePasswordForm';
import { TotpManager } from './TotpManager';
import { ThemeToggle } from '@/components/ThemeToggle';

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
              <span className="text-zinc-500 dark:text-zinc-400">Jméno: </span>
              <span className="font-medium">{session.fullName}</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">E-mail: </span>
              <span className="font-medium">{session.email}</span>
            </div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vzhled</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <ThemeToggle />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Vyberte vzhled aplikace. „Systémový“ se přizpůsobí nastavení vašeho zařízení.
          </p>
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
