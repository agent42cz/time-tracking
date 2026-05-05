/**
 * Render the extension icons by feeding inline SVG into headless Chromium
 * and screenshotting at each MV3-required size. Produces:
 *   public/icons/icon-{16,32,48,128}-{idle,active}.png
 *
 * Run with: pnpm --filter @tt/extension icons
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 32, 48, 128];

// Stopwatch silhouette. Idle = neutral zinc; active = emerald with a red
// accent dot in the corner so the running state pops at 16px.
const STATES = {
  idle: { bg: '#18181b', face: '#f4f4f5', hand: '#18181b', dot: null },
  active: { bg: '#10b981', face: '#ffffff', hand: '#065f46', dot: '#ef4444' },
};

function html(state, size) {
  const c = STATES[state];
  // Viewbox 64×64, drawn slightly off-center so the stopwatch crown doesn't
  // crop. The accent dot is positioned to remain visible at 16px.
  const accent = c.dot
    ? `<circle cx="50" cy="14" r="9" fill="${c.dot}" stroke="#ffffff" stroke-width="2"/>`
    : '';
  return `<!doctype html><html><head><style>
    html,body { margin:0; padding:0; background:transparent; }
    .wrap { width:${size}px; height:${size}px; }
    svg { width:100%; height:100%; display:block; }
  </style></head><body><div class="wrap">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="2" width="12" height="6" rx="2" fill="${c.bg}"/>
      <rect x="29" y="0" width="6" height="3" rx="1" fill="${c.bg}"/>
      <circle cx="32" cy="36" r="24" fill="${c.bg}"/>
      <circle cx="32" cy="36" r="19" fill="${c.face}"/>
      <line x1="32" y1="36" x2="32" y2="22" stroke="${c.hand}" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="36" x2="44" y2="36" stroke="${c.hand}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="36" r="2.5" fill="${c.hand}"/>
      ${accent}
    </svg>
  </div></body></html>`;
}

const browser = await chromium.launch();
try {
  for (const state of Object.keys(STATES)) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(html(state, size), { waitUntil: 'load' });
      const buf = await page.screenshot({ type: 'png', omitBackground: true });
      const out = `${OUT_DIR}/icon-${size}-${state}.png`;
      writeFileSync(out, buf);
      process.stdout.write(`wrote ${out}\n`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
