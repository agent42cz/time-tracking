'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { Alert, Button, Field, FieldGroup, Input } from '@tt/ui';
import { magicLinkSendAction, passwordLoginAction } from '@/lib/actions/auth';

type Mode = 'password' | 'magic';
type PasswordStep = 'credentials' | 'totp';

export function LoginForms(): ReactElement {
  const [mode, setMode] = useState<Mode>('password');
  const [step, setStep] = useState<PasswordStep>('credentials');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset(): void {
    setStep('credentials');
    setCredentials(null);
    setError(null);
  }

  function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');
    setError(null);
    startTransition(async () => {
      const r = await passwordLoginAction(fd);
      if (r.reason === 'totp_required') {
        setCredentials({ email, password });
        setStep('totp');
        return;
      }
      setError(r.error);
    });
  }

  function onTotpSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!credentials) return;
    const fd = new FormData();
    fd.set('email', credentials.email);
    fd.set('password', credentials.password);
    fd.set('totp', String(new FormData(e.currentTarget).get('totp') ?? ''));
    setError(null);
    startTransition(async () => {
      const r = await passwordLoginAction(fd);
      // The action redirects on success; only failures land here.
      setError(r.error);
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
      {step === 'credentials' ? (
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
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {mode === 'password' && step === 'credentials' ? (
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
            <Button type="submit" loading={pending} className="w-full">
              Přihlásit se
            </Button>
          </FieldGroup>
        </form>
      ) : null}

      {mode === 'password' && step === 'totp' && credentials ? (
        <form onSubmit={onTotpSubmit}>
          <FieldGroup>
            <p className="text-sm text-zinc-700">
              Přihlášení jako <strong>{credentials.email}</strong>
            </p>
            <Field
              label="Kód z autentikační aplikace"
              htmlFor="totp"
              hint="6 číslic z Google Authenticator, Authy, 1Password apod."
            >
              <Input
                id="totp"
                name="totp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="123456"
                className="text-center font-mono text-lg tracking-widest"
              />
            </Field>
            <Button type="submit" loading={pending} className="w-full">
              Pokračovat
            </Button>
            <button
              type="button"
              onClick={reset}
              className="mt-1 block w-full text-center text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              ← Zpět na přihlášení
            </button>
          </FieldGroup>
        </form>
      ) : null}

      {mode === 'magic' && step === 'credentials' ? (
        magicSent ? (
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
        )
      ) : null}
    </div>
  );
}
