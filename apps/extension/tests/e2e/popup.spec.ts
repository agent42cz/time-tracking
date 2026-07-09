import { expect, test } from '@playwright/test';
import { buildApiFixture, openPopup } from './fixtures.js';

test.describe('extension popup', () => {
  test('boots with a running timer and a scrollable history', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    await expect(page.getByText('Probíhá (1)')).toBeVisible();
    await expect(page.getByText('Běžící úkol')).toBeVisible();

    // 25 history rows in a 600px popup must overflow the viewport.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(600);
  });

  test('US-92: the running row shows seconds and ticks every second', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    const duration = page.getByTestId('running-duration');
    await expect(duration).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(duration).toHaveText(/^01:01:0\d$/);

    // Poll rather than sleep — the constitution bans setTimeout for sync.
    const first = await duration.textContent();
    await expect.poll(async () => duration.textContent(), { timeout: 5_000 }).not.toBe(first);
  });

  test('US-92: stopped history rows keep HH:MM, without seconds', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    // Each seeded history entry is exactly 30 minutes long.
    await expect(page.getByText('00:30', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('00:30:00', { exact: true })).toHaveCount(0);
  });

  test('US-92: a 1s tick does not clobber the manual-entry start input', async ({ page }) => {
    // Regression guard for bce7cbb (web: "manual start input was uneditable").
    await openPopup(page, buildApiFixture());

    // "Přidat ručně" lives inside MoreMenu (popup.tsx:690), behind the ⋯
    // toggle whose accessible name comes from its title attribute.
    await page.getByTitle('Více').click();
    await page.getByRole('menuitem', { name: 'Přidat ručně' }).click();

    const startTime = page.locator('input[type="time"]').first();
    await startTime.fill('08:15');

    // Wait for at least one tick by observing the running duration change.
    const duration = page.getByTestId('running-duration');
    const first = await duration.textContent();
    await expect.poll(async () => duration.textContent(), { timeout: 5_000 }).not.toBe(first);

    await expect(startTime).toHaveValue('08:15');
  });

  test('US-92: an idle popup prefills manual entry with the time the sheet opened', async ({
    page,
  }) => {
    // Install the faked clock at the real current time (before navigating)
    // so the seeded session (expiresAt = now + 30d) is still valid inside
    // the page once we fast-forward it.
    await page.clock.install({ time: new Date() });
    await openPopup(page, buildApiFixture({ running: false }));

    // With no running timer, AppShell's tick effect (gated on hasRunning)
    // never starts, so `now` stays frozen at whatever it was at mount. Only
    // a sheet that captures its own open-time nowIso — not the frozen tick —
    // will prefill the correct (post-fast-forward) start time.
    await page.clock.fastForward('10:00');

    await page.getByTitle('Více').click();
    await page.getByRole('menuitem', { name: 'Přidat ručně' }).click();

    // Derive the expected value the same way src/datetime.ts's toTimeInput
    // does (pad(getHours()):pad(getMinutes()), browser-local zone) from
    // inside the page, so we compare the faked clock against itself.
    const expected = await page.evaluate(() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    await expect(page.locator('input[type="time"]').first()).toHaveValue(expected);
  });

  test('US-99: opening an entry while scrolled keeps the sheet header on screen', async ({
    page,
  }) => {
    // 60 rows so the document is far taller than the 600px viewport in ANY
    // environment — CI's headless Linux renders rows much shorter than macOS,
    // so a smaller count left too little scroll headroom and this test flaked.
    await openPopup(page, buildApiFixture({ historyCount: 60 }));

    // Scroll to the bottom of the popup document. We only need to be scrolled
    // (scrollY > 0) — under the old `absolute` bug the header's viewport y would
    // then be negative; the real assertion below is box.y >= 0.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    // Open the last history row's edit sheet.
    await page.getByText('Historický záznam 59').click();

    const header = page.getByText('Upravit záznam');
    await expect(header).toBeVisible();

    const box = await header.boundingBox();
    if (!box) throw new Error('sheet header has no bounding box');

    // boundingBox() is relative to the viewport. With `absolute inset-0` on a
    // document-tall parent, the header sits at document y≈0, i.e. a negative
    // viewport y once scrolled.
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(600);

    // The title field must be visible too, not just the header. Scope to the
    // dialog: the always-mounted StartRow description input (popup.tsx:901)
    // shares this placeholder with the sheet's Název field.
    await expect(page.getByRole('dialog').getByPlaceholder('Co děláte?')).toBeInViewport();
  });

  test('US-99: the body does not scroll behind an open sheet', async ({ page }) => {
    await openPopup(page, buildApiFixture({ historyCount: 25 }));
    await page.getByText('Historický záznam 0').click();
    await expect(page.getByText('Upravit záznam')).toBeVisible();

    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });
});
