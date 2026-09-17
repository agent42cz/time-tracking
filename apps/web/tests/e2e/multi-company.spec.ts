import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('US-7: adds a second company and enables it on the existing MCP connection', async ({
  page,
  baseURL,
}) => {
  await page.goto('/settings/api-tokens');
  await page.getByRole('button', { name: 'Vytvořit token' }).first().click();
  await page.getByLabel('Název', { exact: true }).fill('One connection');
  await page.getByRole('button', { name: 'Vytvořit token' }).last().click();
  const secret = page.locator('pre').first();
  await expect(secret).toBeVisible();
  const token = (await secret.textContent())!.trim();
  await page.getByRole('button', { name: 'Zavřít', exact: true }).click();

  await page.goto('/settings');
  await page.getByRole('link', { name: 'Spravovat a přidat firmu' }).click();
  await page.getByLabel('Název firmy', { exact: true }).fill('Moje druhá firma');
  await page.getByRole('button', { name: 'Vytvořit firmu', exact: true }).click();
  await expect(page).toHaveURL(/\/timer$/);
  const switcher = page.getByRole('combobox', { name: 'Aktivní firma' });
  await expect(switcher).toHaveValue(/.+/);
  const secondId = await switcher.inputValue();
  await expect(switcher.locator('option:checked')).toHaveText(/Moje druhá firma/);
  await switcher.selectOption({ label: 'E2E Co (správce)' });
  await expect(switcher.locator('option:checked')).toHaveText(/E2E Co/);
  await switcher.selectOption(secondId);
  await expect(switcher).toHaveValue(secondId);

  const client = new Client({ name: 'multi-company-e2e', version: '1' }, { capabilities: {} });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  try {
    const before = await client.callTool({ name: 'list_companies', arguments: {} });
    expect((before.structuredContent as { companies: unknown[] }).companies).toHaveLength(1);
    await page.goto('/settings/api-tokens');
    const scope = page
      .getByRole('checkbox', { name: 'Všechny moje firmy' })
      .filter({ visible: true });
    await scope.check();
    await expect(scope).toBeEnabled();
    await expect(scope).toBeChecked();
    await expect
      .poll(
        async () =>
          (await client.callTool({ name: 'list_companies', arguments: {} })).structuredContent,
      )
      .toMatchObject({
        companies: expect.arrayContaining([expect.objectContaining({ id: secondId })]),
      });
    const started = await client.callTool({
      name: 'start_timer',
      arguments: { companyId: secondId, title: 'Práce pro druhou firmu' },
    });
    expect(started.isError).not.toBe(true);
    const id = (started.structuredContent as { id: string }).id;
    const list = await client.callTool({
      name: 'list_running_entries',
      arguments: { companyId: secondId },
    });
    expect(list.structuredContent).toMatchObject({ entries: [expect.objectContaining({ id })] });
    const stopped = await client.callTool({ name: 'stop_timer', arguments: { entryId: id } });
    expect(stopped.isError).not.toBe(true);
  } finally {
    await client.close();
  }
});
