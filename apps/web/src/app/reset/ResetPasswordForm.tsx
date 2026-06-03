'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { Alert, Button, Field, FieldGroup, Input } from '@tt/ui';
import { passwordResetCompleteAction } from '@/lib/actions/auth';

export function ResetPasswordForm({ token }: { token: string }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    setError(null);
    if (password.length < 12) {
      setError('Heslo musí mít aspoň 12 znaků');
      return;
    }
    if (password !== confirm) {
      setError('Hesla se neshodují');
      return;
    }
    fd.set('token', token);
    startTransition(async () => {
      const r = await passwordResetCompleteAction(fd);
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Heslo bylo nastaveno. Můžete se přihlásit.</Alert>
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 active:bg-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-50 dark:focus-visible:ring-zinc-100"
        >
          Přejít na přihlášení
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Nové heslo" htmlFor="password" hint="Minimálně 12 znaků.">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            autoFocus
          />
        </Field>
        <Field label="Heslo znovu" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <Button type="submit" loading={pending} className="w-full">
          Nastavit heslo
        </Button>
      </FieldGroup>
    </form>
  );
}
