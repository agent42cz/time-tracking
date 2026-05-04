'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Alert, Button, Field, FieldGroup, Input } from '@tt/ui';
import { magicLinkSendAction, passwordLoginAction } from '@/lib/actions/auth';

type Mode = 'password' | 'magic';

export function LoginForms(): ReactElement {
  const [mode, setMode] = useState<Mode>('password');
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await passwordLoginAction(fd);
      if (r && !r.ok) setError(r.error);
    });
  }

  function onMagicSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await magicLinkSendAction(fd);
      if (r.ok) setMagicSent(true);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('password');
            setError(null);
          }}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'password' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
        >
          Heslo
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('magic');
            setError(null);
          }}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === 'magic' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
        >
          Odkaz na e-mail
        </button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {mode === 'password' ? (
        <form onSubmit={onPasswordSubmit}>
          <FieldGroup>
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Heslo" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Kód 2FA (volitelné)" htmlFor="totp">
              <Input
                id="totp"
                name="totp"
                inputMode="numeric"
                pattern="\d{6}"
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </Field>
            <Button type="submit" loading={pending} className="w-full">
              Přihlásit se
            </Button>
          </FieldGroup>
        </form>
      ) : magicSent ? (
        <Alert tone="success">
          Pokud účet existuje, odeslali jsme přihlašovací odkaz na váš e-mail. Platnost odkazu
          je 15 minut.
        </Alert>
      ) : (
        <form onSubmit={onMagicSubmit}>
          <FieldGroup>
            <Field
              label="E-mail"
              htmlFor="email-magic"
              hint="Pošleme vám odkaz pro přihlášení (platnost 15 min)."
            >
              <Input
                id="email-magic"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Button type="submit" loading={pending} className="w-full">
              Poslat odkaz
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
