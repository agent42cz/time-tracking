import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { PageHeader } from '@/components/PageHeader';

export default function ExtensionPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rozšíření do prohlížeče"
        description="Měřte čas přímo z lišty Chromu, bez přepínání záložek."
      />

      <Card>
        <CardHeader>
          <CardTitle>Instalace z Chrome Web Store</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <a
                href="https://chromewebstore.google.com/detail/time-tracker/gdkdkhjhgifmhdbbmhlcihcnmgflcdla"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 text-sm font-medium text-white dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 focus-visible:ring-offset-2"
              >
                Otevřít Chrome Web Store
              </a>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Doporučený způsob. Funguje v Chromu, Edgi, Braveu a dalších prohlížečích založených
                na Chromiu. Aktualizace probíhají automaticky.
              </p>
            </div>
            <ol className="list-decimal space-y-3 pl-4 sm:pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              <li>
                Klikněte na tlačítko výše a v Chrome Web Store zvolte{' '}
                <strong>Přidat do Chromu</strong>.
              </li>
              <li>
                Klikněte na ikonu skládačky vpravo od adresního řádku a u Time Trackeru zvolte{' '}
                <strong>Připnout</strong>. Ikona se objeví přímo v liště.
              </li>
              <li>
                Otevřete rozšíření a klikněte na <strong>Připojit účet</strong>. Otevře se nová
                záložka s touto webovou aplikací. Pokud nejste přihlášeni, přihlaste se. Po úspěchu
                se záložka sama zavře a rozšíření se propojí.
              </li>
            </ol>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
