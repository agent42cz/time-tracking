import { test, expect } from '@playwright/test';

test.describe('destructive confirm dialog', () => {
  test('delete-entry: cancel keeps the entry, confirm removes it', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e confirm ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();
    await page.getByRole('button', { name: '■ Stop' }).first().click();
    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    await row.getByTitle('Smazat').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Smazat záznam?')).toBeVisible();

    await dialog.getByRole('button', { name: 'Zrušit' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();

    await row.getByTitle('Smazat').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Smazat' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeHidden();
  });

  test('delete-entry: Escape key cancels the dialog without deleting', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e confirm-esc ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();
    await page.getByRole('button', { name: '■ Stop' }).first().click();
    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    await row.getByTitle('Smazat').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();
  });
});
