'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Field, FieldGroup, Input } from '@tt/ui';
import { inviteAcceptAsExistingAction, inviteAcceptAsNewAction } from '@/lib/actions/auth';

export function InviteAcceptForm({
  token,
  email,
  role,
  isLoggedIn,
  loggedEmail,
}: {
  token: string;
  email: string;
  role: 'admin' | 'user';
  isLoggedIn: boolean;
  loggedEmail: string | null;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-700">
        E-mail: <strong>{email}</strong> &middot; Role:{' '}
        <Badge tone={role === 'admin' ? 'info' : 'neutral'}>
          {role === 'admin' ? 'Správce' : 'Člen'}
        </Badge>
      </p>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {isLoggedIn ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700">
            Jste přihlášeni jako <strong>{loggedEmail}</strong>. Chcete-li přijmout pozvánku
            pod tímto účtem, klikněte níže.
          </p>
          <Button
            type="button"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await inviteAcceptAsExistingAction(token);
                if (!r.ok) setError(r.error);
              })
            }
            className="w-full"
          >
            Přijmout pozvánku
          </Button>
          <p className="text-center text-xs text-zinc-500">
            <Link href="/login" className="underline">
              Přihlásit jako někdo jiný
            </Link>
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set('token', token);
            setError(null);
            startTransition(async () => {
              const r = await inviteAcceptAsNewAction(fd);
              if (r && !r.ok) setError(r.error);
            });
          }}
        >
          <FieldGroup>
            <Field label="Jméno a příjmení" htmlFor="fullName">
              <Input id="fullName" name="fullName" required minLength={1} maxLength={120} />
            </Field>
            <Field label="Heslo" htmlFor="password" hint="Aspoň 12 znaků.">
              <Input id="password" name="password" type="password" required minLength={12} />
            </Field>
            <Button type="submit" loading={pending} className="w-full">
              Vytvořit účet a přijmout pozvánku
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
