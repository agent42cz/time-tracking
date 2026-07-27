import { test, expect } from '@playwright/test';
import { CLIENT_COLORS } from '@tt/shared';

/** hex '#rrggbb' -> the `rgb(r, g, b)` string a browser reports from getComputedStyle. */
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test.describe('US-102: client colour', () => {
  // This asserts the light-mode colour (Client.color stores the light hex;
  // the dark counterpart only applies under a `.dark` ancestor) — pin the
  // color scheme so the assertion doesn't depend on the OS/browser default.
  test.use({ colorScheme: 'light' });

  test('US-102: an admin picks a client colour and it tints the timer list', async ({ page }) => {
    await page.goto('/clients');

    // Expand "Agent 42" (seeded in global-setup.ts). The toggle button's
    // aria-label ("Rozbalit projekty") is identical for every row, so scope
    // the lookup to this client's own <li>.
    const row = page.locator('li').filter({ hasText: 'Agent 42' }).first();
    await row.getByRole('button', { name: 'Rozbalit projekty' }).click();

    // The picker renders [DEFAULT_CLIENT_COLOR, ...CLIENT_COLORS.map(c => c.light)],
    // so index 0 is the grey default and the palette is shifted by one:
    // nth(4) -> CLIENT_COLORS[3]. Re-derive from the real array rather than
    // hardcoding a hex, since the palette has changed since this test was drafted.
    const swatchIndex = 4;
    const expectedHex = CLIENT_COLORS[swatchIndex - 1]!.light;
    await page
      .getByRole('radiogroup', { name: 'Barva klienta' })
      .getByRole('radio')
      .nth(swatchIndex)
      .click();

    await page.goto('/timer');
    await page.getByLabel('Co děláte?').fill(`e2e color ${Date.now()}`);
    await page.getByLabel('Klient').selectOption({ label: 'Agent 42' });
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Scope to the running-timers card. A bare `getByText('Agent 42')` matches the
    // start form's own <option> first, which carries the page's default text colour
    // and would assert nothing about the tint.
    const runningCard = page.getByTestId('running-timers');
    await expect(runningCard.getByText('Agent 42').first()).toHaveCSS(
      'color',
      hexToRgb(expectedHex),
    );

    // Stop the timer this test started. Leaving it running makes the very next
    // spec's `getByRole('button', { name: '■ Stop' }).first()` hit this entry
    // instead of its own, which cascaded into three unrelated failures.
    await runningCard.getByRole('button', { name: '■ Stop' }).click();
    await expect(runningCard).toBeHidden();
  });
});
