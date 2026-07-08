import { expect, test } from '@playwright/test';

test.describe('US-94: undo a deleted entry', () => {
  test('US-94: deleting an entry offers an undo that restores it', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e undo ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Scope Stop to our own running row (not .first()) — another test can
    // leave an unrelated timer running, and a blind .first() would stop that
    // one instead of the entry this test just created.
    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
      .last();
    await expect(runningRow).toBeVisible();
    await runningRow.getByRole('button', { name: '■ Stop' }).click();

    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    await row.getByTitle('Smazat').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Smazat' }).click();
    await expect(row).toBeHidden();

    // The undo affordance appears and brings the row back.
    const undo = page.getByRole('alert').filter({ hasText: 'Záznam byl smazán' });
    await expect(undo).toBeVisible();
    await undo.getByRole('button', { name: 'Vrátit zpět' }).click();

    await expect(row).toBeVisible();
    await expect(undo).toBeHidden();
  });

  test('US-94: dismissing the undo leaves the entry deleted and in the trash', async ({ page }) => {
    await page.goto('/timer');

    const description = `e2e no-undo ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Scope Stop to our own running row — see comment in the test above.
    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
      .last();
    await expect(runningRow).toBeVisible();
    await runningRow.getByRole('button', { name: '■ Stop' }).click();

    const row = page.locator('li').filter({ hasText: description });
    await row.getByTitle('Smazat').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat' }).click();
    await expect(row).toBeHidden();

    await page.goto('/trash');
    // /trash renders both a desktop table and a mobile card list (responsive
    // sweep, pre-existing); .first() matches the same idiom as responsive.spec.ts.
    await expect(page.getByText(description).first()).toBeVisible();
  });
});
