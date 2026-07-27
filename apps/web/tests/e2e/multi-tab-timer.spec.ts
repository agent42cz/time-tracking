import { expect, test } from '@playwright/test';

test('US-103: a stop in one tab clears the running timer in another visible tab', async ({
  browser,
}) => {
  // Two independent tabs, both authenticated as the seeded e2e admin
  // (global-setup.ts writes this storage state; playwright.config.ts's own
  // `use.storageState` points here too, but a fresh `browser.newContext()`
  // does not inherit it, so it's passed explicitly).
  const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' });
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await tabA.goto('/timer');
  await tabB.goto('/timer');

  const description = `cross-tab check ${Date.now()}`;
  await tabA.getByLabel('Co děláte?').fill(description);
  await tabA.getByRole('button', { name: '▶ Spustit' }).click();
  await expect(tabA.getByText(description)).toBeVisible();

  // Tab B must learn about it over the socket, with no focus change and no
  // reload — this is the whole point of the test (US-103).
  await expect(tabB.getByText(description)).toBeVisible({ timeout: 10_000 });

  await tabA.getByRole('button', { name: '■ Stop' }).first().click();

  // ...and must see the stop too: the running-timers card either loses the
  // row or disappears entirely (it renders nothing when `running.length === 0`,
  // see RunningTimers.tsx / TimerLists.tsx), so assert absence from the page
  // rather than requiring the testid'd card to still be present.
  await expect(tabB.getByTestId('running-timers').getByText(description)).toBeHidden({
    timeout: 10_000,
  });

  await context.close();
});
