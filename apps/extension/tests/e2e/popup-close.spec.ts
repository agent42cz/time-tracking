import { expect, test, type Page } from '@playwright/test';
import {
  buildApiFixture,
  installApiStubs,
  installChromeStub,
  openPopup,
  POPUP_URL,
  seedStorage,
} from './fixtures.js';

// The headless shell treats each page as independently focused. Full Chromium
// has browser tab activation, so bringToFront really removes popup focus.
test.use({ channel: 'chromium' });

// A script-opened window lets us exercise real window.close(), including the
// browser's close event, instead of replacing it with a spy in a regular tab.
async function createPopupWindow(opener: Page): Promise<Page> {
  const opened = opener.waitForEvent('popup');
  await opener.evaluate(() => window.open('about:blank'));
  return opened;
}

async function closeTracker(popup: Page): Promise<void> {
  const button = popup.getByRole('button', { name: 'Zavřít tracker', exact: true });
  await expect(button).toBeInViewport();
  const closed = popup.waitForEvent('close');
  await button.click();
  await closed;
}

async function useRealFocus(popup: Page): Promise<void> {
  // Bring the underlying window forward BEFORE removing Playwright's emulated
  // focus, or disabling emulation itself can blur an actually background window.
  await popup.bringToFront();
  const session = await popup.context().newCDPSession(popup);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await expect.poll(() => popup.evaluate(() => document.hasFocus())).toBe(true);
}

test.describe('popup dismissal (AIAGE-68)', () => {
  test('US-30: clicking outside dismisses a popup the browser left open', async ({ page }) => {
    await page.setContent('<button>Outside the tracker</button>');
    const popup = await createPopupWindow(page);
    await openPopup(popup);
    await expect(popup.getByText('Běžící úkol')).toBeVisible();
    await useRealFocus(popup);
    await popup.getByPlaceholder('Co děláte?').click();
    await expect.poll(() => popup.evaluate(() => document.hasFocus())).toBe(true);

    await page.bringToFront();
    await page.getByRole('button', { name: 'Outside the tracker' }).click();

    await expect.poll(() => popup.isClosed()).toBe(true);
    expect(page.isClosed()).toBe(false);
  });

  test('US-30: internal controls and native dropdowns keep the popup open', async ({ page }) => {
    const popup = await createPopupWindow(page);
    await openPopup(popup);
    await expect(popup.getByText('Běžící úkol')).toBeVisible();
    await useRealFocus(popup);
    await popup.getByPlaceholder('Co děláte?').fill('Rozpracovaný úkol');
    const clients = popup.getByRole('combobox').first();
    await clients.click();
    await popup.keyboard.press('ArrowDown');
    await popup.keyboard.press('Enter');
    await expect(clients).toHaveValue('cli-1');
    await popup.getByTitle('Více').click();
    await popup.getByRole('menuitem', { name: 'Přidat ručně' }).click();
    await popup.locator('input[type="time"]').first().fill('08:15');
    await popup.getByRole('button', { name: 'Změnit datum' }).click();
    const date = popup.locator('input[type="date"]');
    await date.click();
    await date.evaluate((input: HTMLInputElement) => input.showPicker());
    await popup.keyboard.press('Escape');
    await date.fill('2026-09-01');
    await expect(date).toHaveValue('2026-09-01');
    expect(popup.isClosed()).toBe(false);
  });

  test('US-30: a popup page opened as a regular tab stays open when focus moves away', async ({
    page,
  }) => {
    await page.setContent('<button>Outside the tracker</button>');
    const popup = await createPopupWindow(page);
    await popup.clock.install();
    await installChromeStub(popup, seedStorage(), false);
    await installApiStubs(popup, buildApiFixture());
    await popup.goto(POPUP_URL);
    await expect(popup.getByText('Běžící úkol')).toBeVisible();
    await useRealFocus(popup);

    await page.bringToFront();
    await page.getByRole('button', { name: 'Outside the tracker' }).click();
    await expect.poll(() => popup.evaluate(() => document.hasFocus())).toBe(false);
    await popup.clock.runFor(10);

    expect(popup.isClosed()).toBe(false);
  });

  test('US-30: closes the tracker without a timer mutation or logout', async ({ page }) => {
    const popup = await createPopupWindow(page);
    const mutations: string[] = [];
    popup.on('request', (request) => {
      if (request.url().includes('/api/') && request.method() !== 'GET') {
        mutations.push(`${request.method()} ${request.url()}`);
      }
    });
    await openPopup(popup);
    await expect(popup.getByText('Běžící úkol')).toBeVisible();

    await closeTracker(popup);

    expect(mutations).toEqual([]);
    expect(page.isClosed()).toBe(false);
  });

  test('US-30: close remains reachable after scrolling the history', async ({ page }) => {
    const popup = await createPopupWindow(page);
    await openPopup(popup, buildApiFixture({ historyCount: 60 }));
    await expect(popup.getByText('Historický záznam 59')).toBeAttached();
    await popup.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => popup.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await closeTracker(popup);
  });

  test('US-30: closes from the login screen without submitting the form', async ({ page }) => {
    const popup = await createPopupWindow(page);
    await installChromeStub(popup, {});
    await popup.goto(POPUP_URL);
    await expect(popup.getByRole('button', { name: 'Přihlásit se přes web' })).toBeVisible();

    await closeTracker(popup);
  });

  for (const method of ['X button', 'outside click']) {
    test(`US-30: closes via ${method} while initial API requests are still loading`, async ({
      page,
    }) => {
      await page.setContent('<button>Outside the tracker</button>');
      const popup = await createPopupWindow(page);
      await installChromeStub(popup, seedStorage());
      let releaseRequests!: () => void;
      const pending = new Promise<void>((resolve) => {
        releaseRequests = resolve;
      });
      await popup.context().route('**/api/v1/**', async (route) => {
        await pending;
        await route.abort();
      });
      try {
        await popup.goto(POPUP_URL);
        await expect(popup.getByText('Načítám…', { exact: true })).toBeVisible();

        if (method === 'X button') {
          await closeTracker(popup);
        } else {
          await useRealFocus(popup);
          await page.bringToFront();
          await page.getByRole('button', { name: 'Outside the tracker' }).click();
          await expect.poll(() => popup.isClosed()).toBe(true);
        }
      } finally {
        releaseRequests();
        await popup.context().unrouteAll({ behavior: 'wait' });
      }
    });
  }
});
