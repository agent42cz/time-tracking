import type { ReactElement } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { requireUser, prisma } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { ChangePasswordForm } from './ChangePasswordForm';
import { TotpManager } from './TotpManager';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AutoStackToggle } from '@/components/settings/AutoStackToggle';

export default async function SettingsPage(): Promise<ReactElement> {
  const session = await requireUser();
  const user = await prisma().user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { autoStackOverlaps: true },
  });
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
          <CardTitle>Záznamy</CardTitle>
        </CardHeader>
        <CardBody>
          <AutoStackToggle initialValue={user.autoStackOverlaps} />
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
      <Card>
        <CardHeader>
          <CardTitle>API tokeny</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Osobní tokeny pro připojení Claude Code (MCP).
          </p>
          <div className="mt-3">
            <Link
              href="/settings/api-tokens"
              className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Spravovat API tokeny
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
