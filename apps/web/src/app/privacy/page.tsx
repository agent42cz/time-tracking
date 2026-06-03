import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';

export const metadata = {
  title: 'Ochrana soukromí — Time Tracker',
  description: 'Zásady ochrany osobních údajů pro Time Tracker a jeho rozšíření do prohlížeče.',
};

export default function PrivacyPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-start justify-center bg-zinc-50 dark:bg-zinc-900 px-4 py-4 sm:py-8 md:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Time Tracker
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Ochrana soukromí</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Zásady ochrany osobních údajů</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <p>
                Time Tracker je self-hostovaná aplikace. Veškerá data — záznamy o měření času,
                klienti, projekty, štítky, uživatelské účty a relace — jsou uložena výhradně na
                serveru, který provozuje vaše organizace. Provozovatel této kódové základny ani
                vývojáři rozšíření do prohlížeče nemají přístup k vašim datům.
              </p>

              <h2 className="pt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Webová aplikace
              </h2>
              <p>
                Webová aplikace neukládá data o vašem chování ani je nepředává třetím stranám.
                Nepoužívá analytické skripty, marketingové cookies, ani službu typu Google
                Analytics. Cookies používáme výhradně pro přihlašovací relaci a uživatelské
                preference (např. aktivní firma).
              </p>

              <h2 className="pt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Rozšíření do prohlížeče
              </h2>
              <p>Rozšíření „Time Tracker“ pro Chrome / Edge:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Neshromažďuje žádné osobní údaje.</strong> Nepoužívá analytiku,
                  telemetrii, ani neposílá data třetím stranám.
                </li>
                <li>
                  <strong>Token relace</strong> vystavený vaší instancí Time Tracker je uložen pouze
                  lokálně v prohlížeči přes{' '}
                  <code className="rounded bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 font-mono text-xs">
                    chrome.storage.local
                  </code>{' '}
                  a odesílán výhradně na URL vaší self-hostované instance.
                </li>
                <li>
                  <strong>
                    Oprávnění{' '}
                    <code className="rounded bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 font-mono text-xs">
                      storage
                    </code>
                  </strong>{' '}
                  slouží k uložení tokenu a posledního známého stavu měření mezi spuštěními
                  prohlížeče.
                </li>
                <li>
                  <strong>
                    Oprávnění{' '}
                    <code className="rounded bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 font-mono text-xs">
                      alarms
                    </code>
                  </strong>{' '}
                  slouží k pravidelnému dotázání serveru na aktuální stav stopek.
                </li>
                <li>
                  <strong>Oprávnění k hostiteli</strong> (
                  <code className="rounded bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 font-mono text-xs">
                    https://*.agent42.cz/*
                  </code>
                  ) je potřeba pro volání API vaší instance Time Tracker.
                </li>
                <li>
                  <strong>Žádný vzdálený kód.</strong> Rozšíření nestahuje a nespouští kód odjinud
                  než z balíčku publikovaného v Chrome Web Store.
                </li>
              </ul>

              <h2 className="pt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Kontakt
              </h2>
              <p>
                Pokud máte otázky týkající se zpracování osobních údajů ve vaší instanci Time
                Tracker, kontaktujte správce této instance.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
