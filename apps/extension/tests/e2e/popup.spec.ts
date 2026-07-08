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

  test('US-90: the running row shows seconds and ticks every second', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    const duration = page.getByTestId('running-duration');
    await expect(duration).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(duration).toHaveText(/^01:01:0\d$/);

    // Poll rather than sleep — the constitution bans setTimeout for sync.
    const first = await duration.textContent();
    await expect.poll(async () => duration.textContent(), { timeout: 5_000 }).not.toBe(first);
  });

  test('US-90: stopped history rows keep HH:MM, without seconds', async ({ page }) => {
    await openPopup(page, buildApiFixture());

    // Each seeded history entry is exactly 30 minutes long.
    await expect(page.getByText('00:30', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('00:30:00', { exact: true })).toHaveCount(0);
  });

  test('US-90: a 1s tick does not clobber the manual-entry start input', async ({ page }) => {
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
});
