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
});
