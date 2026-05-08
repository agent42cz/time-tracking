# Chrome Web Store — listing playbook

End-to-end reference for publishing the Time Tracker extension to the
Chrome Web Store as an **unlisted** item, plus the recipe for every
future release.

---

## 0. Prerequisites

- Chrome Web Store developer account (one-time $5 fee).
- Privacy policy live at `https://tracker.agent42.cz/privacy` (deployed from `apps/web/src/app/privacy/page.tsx`).
- The publisher account's **trader / non-trader status** has been declared
  in **Nastavení → Účet** of the dev console.
  - Pick **Toto je účet obchodníka** (trader) since the extension is tied
    to a commercial product on `agent42.cz`. Address & contact will be
    public on the listing — use Agent42's registered office.

---

## 1. Build the upload artifact

```bash
cd apps/extension
pnpm build:publish
```

Produces:

```
apps/extension/time-tracker-extension-v<version>.zip
```

The `build:publish` script:

1. Runs `vite build` (same as `pnpm build`).
2. Strips dev-only entries (`http://localhost:3000/*`) from
   `dist/manifest.json` so reviewers don't reject for broad host
   permissions.
3. Zips `dist/` for upload.

**Local dev is unaffected** — `pnpm build` keeps the localhost
permission so "Load unpacked" works against the local Next.js server.

---

## 2. Generate the listing screenshot (already done, re-run on design changes)

```bash
cd apps/extension
pnpm screenshot
```

Produces:

```
apps/extension/store/screenshot-1280x800.png
```

Stylized 1280×800 mockup of the popup against a branded canvas. Sized
exactly to Chrome Web Store requirements. Source is
`scripts/render-store-screenshot.mjs`.

---

## 3. Submit in the dev console

Go to <https://chrome.google.com/webstore/devconsole>.
For a **first-time publish**: click **+ Nová položka**, drag the zip in.
For an **update**: open the existing item → **Balíček → Nahrát nový balíček**.

Then walk the four left-sidebar tabs.

---

## 4. Tab — Záznam v obchodu (Store listing)

### Podrobnosti o produktu

- **Název z balíčku** — auto-filled from `manifest.json → name`.
- **Souhrn z balíčku** — auto-filled from `manifest.json → description`.
- **Popis\*** — paste:

  ```
  Time Tracker je rozšíření pro Chrome a Edge, které vás propojí s vaší self-hostovanou instancí time trackeru Agent42. Spusťte měření jedním klikem rovnou z lišty prohlížeče, aniž byste museli přepínat na záložku s aplikací.

  Co rozšíření umí:
  • Stav stopek vidíte v ikoně rozšíření — zelená znamená běžící měření, šedá znamená klid.
  • V popupu spustíte nové měření, vidíte aktuálně běžící stopky, a jedním klikem je zastavíte.
  • Volba klienta, projektu a štítků přímo z popupu.
  • Souběh více stopek najednou (pokud to vaše instance povoluje).
  • Přehled dnešních záznamů s celkovým časem.
  • Po přihlášení ve webové aplikaci se token relace automaticky propíše do rozšíření.

  Pro koho je rozšíření určeno:
  Tohle rozšíření je doplněk k self-hostované webové aplikaci Time Tracker (Agent42). Bez běžící instance time trackeru rozšíření nemá k čemu se připojit. Pokud Time Tracker zatím nemáte, kontaktujte správce vaší organizace.

  Soukromí:
  • Žádná telemetrie, žádná analytika, žádné třetí strany.
  • Token relace je uložen pouze lokálně v prohlížeči přes chrome.storage.local.
  • Veškerá data o měření času jsou uložena výhradně na serveru vaší organizace.

  Podrobné zásady ochrany soukromí: https://tracker.agent42.cz/privacy
  ```

- **Kategorie\*** — `Productivity`
- **Jazyk\*** — `Czech – čeština`

### Grafické podklady

- **Ikona obchodu (128 × 128)\*** — upload
  `apps/extension/public/icons/icon-128-idle.png`
- **Snímky obrazovky\*** — upload
  `apps/extension/store/screenshot-1280x800.png`
- **Globální propagační video** — leave empty
- **Malá propagační dlaždice (440 × 280)** — leave empty (only matters
  for storefront placement; irrelevant for unlisted)
- **Dlaždice propagačního běžícího textu (1400 × 560)** — leave empty

### Další pole

- **Oficiální adresa URL** — `Žádný` (can be linked later via Search
  Console verification of `agent42.cz`)
- **Adresa URL domovské stránky** — `https://tracker.agent42.cz`
- **Adresa URL podpory** — `https://tracker.agent42.cz/privacy`
- **Obsah pro dospělé** — off

### Podpora položek

Leave the visibility toggle **off** — no public support tab needed for
an unlisted extension.

Click **Uložit koncept**.

---

## 5. Tab — Ochrana soukromí (Privacy practices)

- **Single purpose** (`Jediný účel`):

  > Stopky propojené se self-hostovanou instancí Agent42 Time Tracker.

- **Permission justifications** — paste these exactly:

  | Permission                                  | Justification                                                                        |
  | ------------------------------------------- | ------------------------------------------------------------------------------------ |
  | `storage`                                   | Persist the user's session token and last-known timer state across browser restarts. |
  | `alarms`                                    | Periodically refresh the timer state from the configured backend.                    |
  | `host_permissions (https://*.agent42.cz/*)` | Required to call the user's self-hosted Time Tracker API.                            |
  | `externally_connectable`                    | Allows the web app to push fresh session tokens to the extension after login.        |

- **Data usage / shromažďování dat** — tick **"I do not collect or use
  any user data"** (žádná uživatelská data nesbírám).

- **Privacy policy URL** — `https://tracker.agent42.cz/privacy`

- **Remote code** — `No, I am not using remote code.`
  (No `eval`, no remote scripts; only the bundled JS shipped in the zip.)

Click **Uložit koncept**.

---

## 6. Tab — Distribuce (Distribution)

- **Visibility / Viditelnost** — **Unlisted** (Neveřejné)
- **Geographic distribution / Geografické rozdělení** — All regions
  (or restrict — doesn't really matter for unlisted)

Click **Uložit koncept**.

---

## 7. Submit

Top-right: **Odeslat ke kontrole**.

- First review: **1–3 days** typically. You'll get email outcomes.
- Update reviews: usually **<24h**.

If rejected, the email names which item to fix; correct, re-upload via
**Balíček → Nahrát nový balíček**, re-submit.

---

## 8. After approval

- Copy the **Item ID** (32-char string) from the dashboard. Save it
  somewhere durable (e.g. `apps/extension/README.md`).
- Install URL: `https://chrome.google.com/webstore/detail/<item-id>`
  — works for unlisted, just doesn't appear in search.
- Auto-update: Chrome polls every ~5 hours; restart picks up new
  versions immediately.

---

## 9. Future-release recipe

For each new version:

1. Bump the version in **both**:
   - `apps/extension/package.json` → `"version"`
   - `apps/extension/public/manifest.json` → `"version"`
2. Rebuild + re-zip:

   ```bash
   cd apps/extension
   pnpm build:publish
   ```

3. Open the dev console → existing **Time Tracker** item →
   **Balíček → Nahrát nový balíček** → upload the new zip.
4. (Optional) update the description / screenshot if anything visible
   changed. Re-run `pnpm screenshot` if the popup design has evolved.
5. Click **Odeslat ke kontrole**. Updates usually clear review in
   under a day.
6. Within ~5 hours of approval, every installed copy auto-updates.

---

## 10. Common rejection reasons (and how to avoid them)

| Symptom                                  | Fix                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| "Justifications are not specific enough" | Use the table above; be concrete about _why_ each permission is needed.                                            |
| "Privacy policy URL not reachable"       | Verify `https://tracker.agent42.cz/privacy` returns 200 from outside your network before submitting.               |
| "Single purpose unclear"                 | The single-purpose statement and the description must agree. Don't mention features unrelated to time tracking.    |
| "Host permissions too broad"             | Already handled by `pnpm build:publish` (localhost stripped). If you ever add a new domain, justify it explicitly. |
| "Trader information missing"             | Fill in Agent42 s.r.o.'s registered office in Nastavení → Účet before submitting.                                  |
