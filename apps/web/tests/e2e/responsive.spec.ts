import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

// Admin storage state can reach every route.
const ROUTES = [
  '/timer',
  '/dashboard',
  '/reports',
  '/clients',
  '/tags',
  '/members',
  '/companies',
  '/audit',
  '/trash',
  '/settings',
  '/settings/api-tokens',
  '/extension',
];

test.describe('responsive layout', () => {
  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow @ ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow on ${route} @ ${vp.width}px`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('mobile shows the bottom tab bar; desktop hides it (sidebar instead)', async ({ page }) => {
    const tabBar = page.locator('nav[aria-label="Hlavní navigace"]');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/timer');
    await expect(tabBar).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(tabBar).toBeHidden();
  });

  test('More sheet exposes company switcher + logout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/timer');
    await page.getByRole('button', { name: 'Více' }).click();
    const sheet = page.getByRole('dialog', { name: 'Více' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Aktivní firma')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Odhlásit' })).toBeVisible();
  });

  test('members: table on desktop, cards on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/members');
    await expect(page.locator('table').first()).toBeVisible();
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(page.locator('table').first()).toBeHidden();
  });
});
