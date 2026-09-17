import { test, expect } from '@playwright/test';
import {
  buildApiFixture,
  installApiStubs,
  installChromeStub,
  seedStorage,
  POPUP_URL,
} from './fixtures';

test('US-7: switches to a second company, clears the draft and persists the selection', async ({
  page,
}) => {
  const api = buildApiFixture({ historyCount: 0 });
  api.me.memberships.push({
    companyId: 'second',
    companyName: 'Moje firma',
    companySlug: 'moje',
    role: 'user',
  });
  await installChromeStub(page, seedStorage());
  await installApiStubs(page, api);
  await page.route('**/api/v1/timer?company=*', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get('company') === 'second'
          ? {
              companyId: 'second',
              running: [],
              history: [],
              summary: { weekMs: 0, monthMs: 0, lastMonthMs: 0 },
            }
          : api.timer,
    }),
  );
  await page.route('**/api/v1/catalog?company=*', (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get('company') === 'second'
          ? { companyId: 'second', clients: [] }
          : api.catalog,
    }),
  );
  await page.goto(POPUP_URL);
  await expect(page.getByText('Běžící úkol', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Co děláte?').fill('Rozpracovaný text');
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('second');
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('second');
  await expect(page.getByText('Běžící úkol', { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Co děláte?')).toHaveValue('');
  const stored = await page.evaluate(() => chrome.storage.local.get(null));
  expect(stored['tt:active-company']).toMatchObject({ companyId: 'second', userId: 'usr-e2e' });
  await installChromeStub(page, stored);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('second');
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('cmp-e2e');
  await expect(page.getByText('Běžící úkol', { exact: true })).toBeVisible();
});

test('US-7: a failed switch preserves the original company and its timers', async ({ page }) => {
  const api = buildApiFixture({ historyCount: 0 });
  api.me.memberships.push({
    companyId: 'second',
    companyName: 'Moje firma',
    companySlug: 'moje',
    role: 'user',
  });
  await installChromeStub(page, seedStorage());
  await installApiStubs(page, api);
  await page.route('**/api/v1/*?company=second', (route) => route.abort('failed'));
  await page.goto(POPUP_URL);
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('second');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('cmp-e2e');
  await expect(page.getByText('Běžící úkol', { exact: true })).toBeVisible();
});

test('US-7: an offline start keeps the second company when replayed after switching back', async ({
  page,
}) => {
  const api = buildApiFixture({ historyCount: 0, running: false });
  api.me.memberships.push({
    companyId: 'second',
    companyName: 'Moje firma',
    companySlug: 'moje',
    role: 'user',
  });
  await installChromeStub(page, seedStorage());
  await installApiStubs(page, api);
  let offline = true;
  const replayed: string[] = [];
  await page.route('**/api/v1/timer?company=*', async (route) => {
    const companyId = new URL(route.request().url()).searchParams.get('company')!;
    if (route.request().method() === 'POST') {
      if (offline) return route.abort('failed');
      replayed.push(companyId);
      return route.fulfill({ json: { id: 'new-timer' } });
    }
    return route.fulfill({ json: { ...api.timer, companyId } });
  });
  await page.route('**/api/v1/catalog?company=*', (route) =>
    route.fulfill({
      json: { companyId: new URL(route.request().url()).searchParams.get('company'), clients: [] },
    }),
  );
  await page.goto(POPUP_URL);
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('second');
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('second');
  await page.getByPlaceholder('Co děláte?').fill('Moje práce');
  await page.getByRole('button', { name: '▶ Spustit', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () => (await chrome.storage.local.get('tt:offline-queue'))['tt:offline-queue'],
      ),
    )
    .toMatchObject({
      mutations: [
        expect.objectContaining({ payload: expect.objectContaining({ companyId: 'second' }) }),
      ],
    });
  offline = false;
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('cmp-e2e');
  await expect.poll(() => replayed).toEqual(['second']);
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('cmp-e2e');
});

test('US-7: emergency close stays available while the second company is loading', async ({
  page,
}) => {
  const api = buildApiFixture({ historyCount: 0 });
  api.me.memberships.push({
    companyId: 'second',
    companyName: 'Moje firma',
    companySlug: 'moje',
    role: 'user',
  });
  await installChromeStub(page, seedStorage());
  await installApiStubs(page, api);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/timer?company=second', async (route) => {
    await gate;
    await route.fulfill({ json: { ...api.timer, companyId: 'second', running: [] } });
  });
  await page.route('**/api/v1/catalog?company=second', (route) =>
    route.fulfill({ json: { companyId: 'second', clients: [] } }),
  );
  await page.goto(POPUP_URL);
  await page.getByRole('combobox', { name: 'Aktivní firma' }).selectOption('second');
  try {
    await expect(page.getByRole('button', { name: '▶ Spustit', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Zavřít tracker', exact: true })).toBeEnabled();
  } finally {
    release();
  }
  await expect(page.getByRole('combobox', { name: 'Aktivní firma' })).toHaveValue('second');
});
