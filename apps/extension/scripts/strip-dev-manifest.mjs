/**
 * Rewrite dist/manifest.json for Chrome Web Store submission: drop the
 * localhost:3000 entries used during local development. Run only via
 * `pnpm build:publish`; `pnpm build` leaves the dev manifest intact.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dirname, '..', 'dist', 'manifest.json');

const DEV_PATTERN = /^https?:\/\/localhost(:|\/)/;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

if (Array.isArray(manifest.host_permissions)) {
  manifest.host_permissions = manifest.host_permissions.filter((m) => !DEV_PATTERN.test(m));
}

if (Array.isArray(manifest.externally_connectable?.matches)) {
  manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(
    (m) => !DEV_PATTERN.test(m),
  );
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`stripped dev entries from ${MANIFEST}\n`);
