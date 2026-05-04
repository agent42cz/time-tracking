'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Button, Field, FieldGroup, Input } from '@tt/ui';
import { changePasswordAction } from '@/lib/actions/auth';

export function ChangePasswordForm(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const r = await changePasswordAction(fd);
          if (!r.ok) setError(r.error);
          else {
            setSuccess(true);
            (e.target as HTMLFormElement).reset();
          }
        });
      }}
    >
      <FieldGroup>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {success ? <Alert tone="success">Heslo bylo změněno.</Alert> : null}
        <Field label="Současné heslo" htmlFor="current">
          <Input id="current" name="current" type="password" required />
        </Field>
        <Field label="Nové heslo" htmlFor="next" hint="Aspoň 12 znaků.">
          <Input id="next" name="next" type="password" required minLength={12} />
        </Field>
        <Button type="submit" loading={pending}>
          Změnit heslo
        </Button>
      </FieldGroup>
    </form>
  );
}
