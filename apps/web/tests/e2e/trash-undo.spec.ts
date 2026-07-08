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
    // TrashList renders every row twice — once for the desktop <table>, once
    // for the mobile <ul> (hidden at this viewport via md: classes). Scope to
    // the table so this doesn't depend on which of the two sibling blocks
    // TrashList happens to render first in the DOM.
    await expect(page.getByRole('table').getByText(description)).toBeVisible();
  });

  test('US-94: a failed undo (server action rejects) surfaces the failure alert instead of being silently swallowed', async ({
    page,
  }) => {
    await page.goto('/timer');

    const description = `e2e undo-reject ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Scope Stop to our own running row — see comment in the first test.
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

    const undo = page.getByRole('alert').filter({ hasText: 'Záznam byl smazán' });
    await expect(undo).toBeVisible();

    // Make the restoreEntryAction server-action POST fail (e.g. simulating a
    // mid-window session expiry / server error) so handleUndo's catch branch
    // in TimerLists.tsx is actually exercised, not just compiled.
    await page.route('**/timer', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.headers()['next-action']) {
        await route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        return;
      }
      await route.continue();
    });

    await undo.getByRole('button', { name: 'Vrátit zpět' }).click();

    const failed = page.getByRole('alert').filter({ hasText: 'Záznam se nepodařilo obnovit.' });
    await expect(failed).toBeVisible();
    // The entry was never actually restored — it's still gone from /timer.
    await expect(row).toBeHidden();
  });
});
