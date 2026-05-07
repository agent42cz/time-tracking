import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { PageHeader } from '@/components/PageHeader';

export default function ExtensionPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rozšíření do prohlížeče"
        description="Měřte čas přímo z lišty Chromu — bez přepínání záložek."
      />

      <Card>
        <CardHeader>
          <CardTitle>Stáhnout</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/tt-extension.zip"
              download
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 text-sm font-medium text-white dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 focus-visible:ring-offset-2"
            >
              Stáhnout ZIP
            </a>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Funguje v Chromu, Edgi, Braveu a dalších prohlížečích založených na Chromiu.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jak nainstalovat</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              Stáhněte ZIP tlačítkem výše a rozbalte ho do složky, kterou nebudete mazat (např.{' '}
              <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5">
                ~/tt-extension
              </code>
              ). Chrome načítá rozšíření z cesty na disku — pokud složku smažete, rozšíření přestane
              fungovat.
            </li>
            <li>
              V prohlížeči otevřete{' '}
              <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5">
                chrome://extensions
              </code>{' '}
              (nebo odpovídající stránku ve vašem prohlížeči).
            </li>
            <li>
              Vpravo nahoře zapněte přepínač <strong>Vývojářský režim</strong> (Developer mode).
            </li>
            <li>
              Klikněte na <strong>Načíst rozbalené</strong> (Load unpacked) a vyberte složku, do
              které jste ZIP rozbalili.
            </li>
            <li>
              Klikněte na ikonu skládačky vpravo od adresního řádku a u Time Trackeru zvolte{' '}
              <strong>Připnout</strong> — ikona se objeví přímo v liště.
            </li>
            <li>
              Otevřete rozšíření a klikněte na <strong>Připojit účet</strong>. Otevře se nová
              záložka s touto webovou aplikací — pokud nejste přihlášeni, přihlaste se. Po úspěchu
              se záložka sama zavře a rozšíření se propojí.
            </li>
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktualizace</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Při novější verzi stáhněte aktuální ZIP, rozbalte ho přes stávající složku (přepište
            soubory) a na stránce{' '}
            <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5">
              chrome://extensions
            </code>{' '}
            klikněte u rozšíření na ikonu šipky pro znovunačtení. Připojení účtu zůstává zachováno.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
