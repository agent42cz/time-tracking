import { test, expect } from '@playwright/test';

test.describe('US-51: search', () => {
  test('US-51: typing filters clients and auto-expands clients matched via a project', async ({
    page,
  }) => {
    await page.goto('/clients');
    await expect(page.getByText('Agent 42')).toBeVisible();
    await expect(page.getByText('Agént Diakritika')).toBeVisible();

    const search = page.getByRole('searchbox', { name: /hledat klienta nebo projekt/i });
    await search.fill('instalace');

    await expect(page.getByText('Instalace agenta')).toBeVisible();
    await expect(page.getByText('Agent 42')).toBeVisible();
    await expect(page.getByText('Agént Diakritika')).toBeHidden();
    await expect(page.getByText('Google Work Space')).toBeHidden();
  });

  test('US-51: search is diacritic-insensitive', async ({ page }) => {
    await page.goto('/clients');
    const search = page.getByRole('searchbox', { name: /hledat/i });
    await search.fill('agent');
    await expect(page.getByText('Agent 42')).toBeVisible();
    await expect(page.getByText('Agént Diakritika')).toBeVisible();
  });

  test('US-51: Esc clears the search input', async ({ page }) => {
    await page.goto('/clients');
    const search = page.getByRole('searchbox', { name: /hledat/i });
    await search.fill('agent');
    await search.press('Escape');
    await expect(search).toHaveValue('');
  });

  test('US-51: empty results render the Czech "Žádné výsledky" message', async ({ page }) => {
    await page.goto('/clients');
    const search = page.getByRole('searchbox', { name: /hledat/i });
    await search.fill('zzznomatch');
    await expect(page.getByText('Žádné výsledky')).toBeVisible();
  });
});

test.describe('US-52/53: drag-and-drop reorder', () => {
  test('US-53: drag handles are hidden and a hint shows while a search is active', async ({
    page,
  }) => {
    await page.goto('/clients');
    const search = page.getByRole('searchbox', { name: /hledat/i });
    await search.fill('agent');
    await expect(page.getByText(/vyhledávání je aktivní – zrušte ho pro řazení/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /přetáhnout pro změnu pořadí/i })).toHaveCount(0);
  });

  test('US-52: dragging a client to a new position persists across reload', async ({ page }) => {
    await page.goto('/clients');
    const handles = page.getByRole('button', { name: /přetáhnout pro změnu pořadí/i });
    await expect(handles.first()).toBeVisible();

    const sourceBox = await handles.first().boundingBox();
    const targetBox = await handles.nth(1).boundingBox();
    if (!sourceBox || !targetBox) throw new Error('handles not visible');

    const reorderResponse = page.waitForResponse(
      (res) => res.url().includes('/clients') && res.request().method() === 'POST',
    );

    await handles.first().hover();
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 8, {
      steps: 12,
    });
    await page.mouse.up();

    // Wait for the server action POST to complete before reloading.
    await reorderResponse;

    await page.reload();
    const after = page.locator('ul > li').filter({ hasText: /Agent 42|Agént Diakritika/ });
    await expect(after.first()).toContainText('Agént');
  });

  // Additional behaviors covered manually + by integration tests in
  // catalog.test.ts (US-52, US-53):
  //   - Optimistic revert on server error (intercepting Next.js server-action
  //     POSTs reliably is fragile across versions; rollback logic is in
  //     ClientsManager and verified by manual smoke).
  //   - Keyboard reorder (tab to handle, Space lift, ArrowDown move, Space
  //     drop) — works in real browsers but Playwright's synthetic Space
  //     doesn't activate dnd-kit's KeyboardSensor in headless Chromium.
  //   - Project drag inside the inner SortableContext — same implementation
  //     as the passing client drag; tight row geometry makes simulated drops
  //     unreliable in headless. Service-level coverage in catalog.test.ts.
  //   - Touch drag — synthetic pointerType='touch' events don't trigger the
  //     PointerSensor reliably in headless. Verified manually on iOS Safari.
});
