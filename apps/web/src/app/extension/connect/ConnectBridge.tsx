'use client';

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@tt/ui';

type Phase = 'sending' | 'sent' | 'failed';

export function ConnectBridge({
  extId,
  token,
  expiresAt,
  apiBase,
  email,
}: {
  extId: string;
  token: string;
  expiresAt: string;
  apiBase: string;
  email: string;
}): ReactElement {
  const [phase, setPhase] = useState<Phase>('sending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    sendToExtension();
    // Only run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendToExtension(): void {
    setPhase('sending');
    setErrorMessage(null);
    interface ChromeRuntime {
      sendMessage: (
        extId: string,
        msg: object,
        cb: (response?: { ok?: boolean; error?: string }) => void,
      ) => void;
      lastError?: { message?: string };
    }
    const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
    if (!runtime?.sendMessage) {
      setPhase('failed');
      setErrorMessage(
        'Tento prohlížeč nepodporuje propojení s rozšířením. Otevřete prosím tuto stránku v Chrome / Brave / Arc / Edge.',
      );
      return;
    }
    try {
      runtime.sendMessage(
        extId,
        { type: 'tt:auth', token, expiresAt, apiBase },
        (response) => {
          const lastErr = runtime.lastError;
          if (lastErr || !response?.ok) {
            setPhase('failed');
            setErrorMessage(
              lastErr?.message ?? response?.error ?? 'Rozšíření odpověď nepřijalo.',
            );
            return;
          }
          setPhase('sent');
          setTimeout(() => {
            try {
              window.close();
            } catch {
              // some browsers refuse to close tabs they didn't open
            }
          }, 800);
        },
      );
    } catch (err) {
      setPhase('failed');
      setErrorMessage(err instanceof Error ? err.message : 'Neznámá chyba.');
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-700">
        Přihlášení jako <strong>{email}</strong>
      </p>
      {phase === 'sending' ? (
        <Alert tone="info">Přenášíme přihlašovací údaje do rozšíření…</Alert>
      ) : null}
      {phase === 'sent' ? (
        <Alert tone="success">
          Hotovo. Rozšíření je přihlášené — tato karta se sama zavře.
        </Alert>
      ) : null}
      {phase === 'failed' ? (
        <>
          <Alert tone="danger">{errorMessage}</Alert>
          <Button onClick={sendToExtension}>Zkusit znovu</Button>
        </>
      ) : null}
      <p className="text-xs text-zinc-500">
        Token zůstává pouze ve vašem prohlížeči (uložen do <code>chrome.storage.local</code> —
        sandboxován per rozšíření).
      </p>
    </div>
  );
}
