/**
 * Render a 1280×800 PNG for the Chrome Web Store listing. The popup itself
 * needs a real session + backend to render meaningfully, so we mock the
 * popup contents in inline HTML, styled to match the production design.
 *
 * Run with: pnpm --filter @tt/extension screenshot
 * Output:   apps/extension/store/screenshot-1280x800.png
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'store');
mkdirSync(OUT_DIR, { recursive: true });

const PAGE = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<style>
  :root {
    --bg-from: #064e3b;
    --bg-to: #0b3d2e;
    --fg: #ecfdf5;
    --muted: #a7f3d0;
    --card-bg: #ffffff;
    --card-fg: #18181b;
    --card-border: #e4e4e7;
    --zinc-500: #71717a;
    --zinc-100: #f4f4f5;
    --zinc-900: #18181b;
    --emerald: #10b981;
    --red: #dc2626;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1280px;
    height: 800px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, var(--bg-from), var(--bg-to));
    color: var(--fg);
  }
  .stage {
    width: 1280px;
    height: 800px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 80px;
    padding: 0 80px;
  }
  .pitch {
    flex: 1;
    max-width: 520px;
  }
  .badge {
    display: inline-block;
    background: rgba(255,255,255,0.12);
    color: var(--muted);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 18px;
  }
  h1 {
    font-size: 48px;
    line-height: 1.1;
    letter-spacing: -0.02em;
    font-weight: 700;
    margin-bottom: 18px;
  }
  .lead {
    font-size: 17px;
    line-height: 1.55;
    color: var(--muted);
    margin-bottom: 28px;
  }
  ul.points {
    list-style: none;
    display: grid;
    gap: 10px;
    font-size: 14px;
    color: rgba(236,253,245,0.92);
  }
  ul.points li::before {
    content: '✓';
    color: var(--emerald);
    margin-right: 10px;
    font-weight: 700;
  }
  /* Popup mockup */
  .popup {
    width: 380px;
    background: var(--card-bg);
    color: var(--card-fg);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.2);
    overflow: hidden;
    flex-shrink: 0;
  }
  .pop-head {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--card-border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pop-head .logo {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--zinc-900);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; font-weight: 700;
  }
  .pop-head h2 {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }
  .pop-head .who {
    font-size: 11px;
    color: var(--zinc-500);
  }
  .pop-body { padding: 14px 16px; }
  .running {
    border: 1px solid var(--zinc-100);
    border-radius: 10px;
    padding: 12px;
    background: #fafafa;
    margin-bottom: 12px;
  }
  .running .label {
    font-size: 10px;
    color: var(--emerald);
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin-bottom: 6px;
    display: flex; align-items: center; gap: 6px;
  }
  .running .label::before {
    content: '';
    width: 8px; height: 8px;
    background: var(--emerald);
    border-radius: 50%;
    animation: none;
  }
  .running .desc {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .running .meta {
    font-size: 12px;
    color: var(--zinc-500);
    margin-bottom: 10px;
  }
  .running .row {
    display: flex; align-items: center; justify-content: space-between;
  }
  .running .elapsed {
    font-family: 'SF Mono', ui-monospace, 'Menlo', monospace;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .stop-btn {
    background: var(--red);
    color: white;
    border: 0;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--zinc-500);
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin: 14px 0 8px;
  }
  .entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--zinc-100);
  }
  .entry:last-child { border-bottom: 0; }
  .entry .name { font-weight: 500; }
  .entry .dur {
    font-family: 'SF Mono', ui-monospace, 'Menlo', monospace;
    color: var(--zinc-500);
    font-size: 12px;
  }
  .pop-foot {
    padding: 10px 16px;
    border-top: 1px solid var(--card-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--zinc-500);
    background: #fafafa;
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="pitch">
      <span class="badge">Time Tracker</span>
      <h1>Stopky pro Agent42 — vždy po ruce.</h1>
      <p class="lead">
        Spusťte měření jedním klikem rovnou z lišty prohlížeče.
        Synchronizováno s vaší self-hostovanou instancí v reálném čase.
      </p>
      <ul class="points">
        <li>Souběh více stopek</li>
        <li>Klienti, projekty, štítky</li>
        <li>Žádná telemetrie, žádná třetí strana</li>
      </ul>
    </div>

    <div class="popup">
      <div class="pop-head">
        <div class="logo">⏱</div>
        <h2>Time Tracker</h2>
        <div class="who">Agent42 · Michal</div>
      </div>
      <div class="pop-body">
        <div class="running">
          <div class="label">Probíhá</div>
          <div class="desc">Code review — pull request #42</div>
          <div class="meta">Acme s.r.o. · Webový portál · vývoj</div>
          <div class="row">
            <div class="elapsed">00:47:12</div>
            <button class="stop-btn">■ Stop</button>
          </div>
        </div>
        <div class="section-title">Dnes</div>
        <div class="entry">
          <span class="name">Daily standup</span>
          <span class="dur">0h 15m</span>
        </div>
        <div class="entry">
          <span class="name">Návrh schématu DB</span>
          <span class="dur">1h 20m</span>
        </div>
        <div class="entry">
          <span class="name">Schůzka s klientem</span>
          <span class="dur">0h 45m</span>
        </div>
      </div>
      <div class="pop-foot">
        <span>app.agent42.cz</span>
        <span>v0.1.0</span>
      </div>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.setContent(PAGE, { waitUntil: 'load' });
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  const out = `${OUT_DIR}/screenshot-1280x800.png`;
  writeFileSync(out, buf);
  process.stdout.write(`wrote ${out}\n`);
  await page.close();
} finally {
  await browser.close();
}
