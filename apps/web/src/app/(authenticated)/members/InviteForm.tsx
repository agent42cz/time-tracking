'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Button, Field, Input, Select } from '@tt/ui';
import { inviteMemberAction } from '@/lib/actions/companies';

export function InviteForm(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const r = await inviteMemberAction(fd);
          if (!r.ok) setError(r.error);
          else {
            setSuccess('Pozvánka odeslána.');
            (e.target as HTMLFormElement).reset();
          }
        });
      }}
    >
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert tone="success" className="mb-3">
          {success}
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" required />
        </Field>
        <Field label="Role" htmlFor="role">
          <Select id="role" name="role" defaultValue="user">
            <option value="user">Člen</option>
            <option value="admin">Správce</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={pending}>
            Odeslat pozvánku
          </Button>
        </div>
      </div>
    </form>
  );
}
