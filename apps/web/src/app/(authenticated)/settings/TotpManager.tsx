'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Badge, Button, Field, Input } from '@tt/ui';
import { totpBeginAction, totpConfirmAction, totpDisableAction } from '@/lib/actions/auth';

export function TotpManager({ enabled }: { enabled: boolean }): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    otpauthUrl: string;
    qrDataUrl: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');

  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <Alert tone="success">
          2FA bylo aktivováno. Uložte si tyto záložní kódy — slouží k jednorázovému přihlášení,
          pokud ztratíte zařízení.
        </Alert>
        <ul className="grid grid-cols-2 gap-2 rounded-md bg-zinc-50 dark:bg-zinc-900 p-3 font-mono text-sm">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button onClick={() => window.location.reload()}>Hotovo</Button>
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="space-y-3">
        <Alert tone="info">
          Naskenujte QR kód v aplikaci Google Authenticator, Authy, 1Password apod. Pokud nemůžete
          skenovat, použijte tajný klíč ručně.
        </Alert>
        <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 sm:flex-row">
          <img
            src={enrollment.qrDataUrl}
            alt="QR kód pro 2FA"
            width={224}
            height={224}
            className="shrink-0 rounded border border-zinc-100 dark:border-zinc-700/60"
          />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tajný klíč (manuální zadání):
              </p>
              <code className="mt-0.5 block select-all break-all rounded bg-zinc-50 dark:bg-zinc-900 px-2 py-1 font-mono text-xs">
                {enrollment.secret}
              </code>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
                Zobrazit otpauth URI
              </summary>
              <code className="mt-1 block select-all break-all rounded bg-zinc-50 dark:bg-zinc-900 px-2 py-1 font-mono text-[10px]">
                {enrollment.otpauthUrl}
              </code>
            </details>
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field
          label="Kód z aplikace"
          htmlFor="totp-confirm"
          hint="Pro potvrzení a generování záložních kódů"
        >
          <Input
            id="totp-confirm"
            inputMode="numeric"
            pattern="\d{6}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await totpConfirmAction(code);
              if (!r.ok) setError(r.error);
              else if ('recoveryCodes' in r) setRecoveryCodes(r.recoveryCodes);
            })
          }
        >
          Potvrdit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Stav: {enabled ? <Badge tone="success">aktivní</Badge> : <Badge>vypnuto</Badge>}
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {enabled ? (
        <Button
          variant="danger"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await totpDisableAction();
              window.location.reload();
            })
          }
        >
          Vypnout 2FA
        </Button>
      ) : (
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await totpBeginAction();
              if (!('secret' in r) || !r.ok) {
                setError('Nelze spustit registraci');
                return;
              }
              setEnrollment({
                secret: r.secret,
                otpauthUrl: r.otpauthUrl,
                qrDataUrl: r.qrDataUrl,
              });
            })
          }
        >
          Zapnout 2FA
        </Button>
      )}
    </div>
  );
}
