'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Alert, Badge, Button, Field, Input } from '@tt/ui';
import {
  totpBeginAction,
  totpConfirmAction,
  totpDisableAction,
} from '@/lib/actions/auth';

export function TotpManager({ enabled }: { enabled: boolean }): ReactElement {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');

  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <Alert tone="success">
          2FA bylo aktivováno. Uložte si tyto záložní kódy — slouží k jednorázovému přihlášení,
          pokud ztratíte zařízení.
        </Alert>
        <ul className="grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-3 font-mono text-sm">
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
          Naskenujte QR / přidejte ručně tajný klíč do aplikace (Google Authenticator, Authy,
          1Password atd.).
        </Alert>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <p className="text-zinc-500">URI:</p>
          <code className="block break-all text-xs">{enrollment.otpauthUrl}</code>
          <p className="mt-2 text-zinc-500">Tajný klíč:</p>
          <code className="text-xs">{enrollment.secret}</code>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Kód z aplikace" htmlFor="totp-confirm" hint="Pro potvrzení a generování záložních kódů">
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
      <p className="text-sm text-zinc-700">
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
              setEnrollment({ secret: r.secret, otpauthUrl: r.otpauthUrl });
            })
          }
        >
          Zapnout 2FA
        </Button>
      )}
    </div>
  );
}
