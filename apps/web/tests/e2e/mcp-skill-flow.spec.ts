import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to /settings/api-tokens, open the create dialog, fill the name,
 *  submit and return the plaintext token shown in the <pre> element. */
async function issueTokenViaUI(
  page: Parameters<typeof test.fn>[0]['page'],
  tokenName: string,
): Promise<string> {
  await page.goto('/settings/api-tokens');
  // Use level:1 to target only the <h1> in PageHeader (the same text appears
  // in the CardTitle <h2> too, which would cause a strict-mode violation).
  await expect(page.getByRole('heading', { name: 'API tokeny', level: 1 })).toBeVisible();

  // Open the dialog — the page CTA button is the first "Vytvořit token".
  await page.getByRole('button', { name: 'Vytvořit token' }).first().click();

  // Fill in the name field. The <Field> component renders
  // <label htmlFor="token-name">Název</label> <input id="token-name" />.
  await page.getByLabel('Název').fill(tokenName);

  // Submit — the dialog submit is the last "Vytvořit token" on the page.
  await page.getByRole('button', { name: 'Vytvořit token' }).last().click();

  // The plaintext appears inside a <pre> element (shown once, copy-warning view).
  const pre = page.locator('pre').first();
  await expect(pre).toBeVisible();
  const token = (await pre.textContent())?.trim() ?? '';
  return token;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('MCP server (US-55, US-57)', () => {
  test('US-55: a user issues a token from settings and a real MCP client lists running entries', async ({
    page,
    baseURL,
  }) => {
    const token = await issueTokenViaUI(page, 'e2e');

    // Token format: tt_pat_ + 24 base32 lowercase chars (a-z, 2-7).
    expect(token).toMatch(/^tt_pat_[a-z2-7]{24}$/);

    // ---------------------------------------------------------------------------
    // Real MCP round-trip
    // ---------------------------------------------------------------------------
    const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'e2e', version: '0.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      // list_running_entries — should return an empty array before we start anything.
      const out = await client.callTool({ name: 'list_running_entries', arguments: {} });
      expect(out.isError).toBeFalsy();
      const entries = (out.structuredContent as { entries: unknown[] }).entries;
      expect(Array.isArray(entries)).toBe(true);

      // start_timer happy path.
      const start = await client.callTool({
        name: 'start_timer',
        arguments: { description: 'e2e mcp ping' },
      });
      expect(start.isError).toBeFalsy();
      const { id } = start.structuredContent as { id: string };
      // CUID v1 format: starts with "c" followed by lowercase alphanumeric chars.
      expect(id).toMatch(/^c[a-z0-9]+$/);

      // list_running should now include the newly started entry.
      const after = await client.callTool({ name: 'list_running_entries', arguments: {} });
      expect(after.isError).toBeFalsy();
      const ids = (after.structuredContent as { entries: { id: string }[] }).entries.map(
        (e) => e.id,
      );
      expect(ids).toContain(id);

      // stop_timer — clean up so subsequent test runs don't accumulate running entries.
      const stop = await client.callTool({ name: 'stop_timer', arguments: { entryId: id } });
      expect(stop.isError).toBeFalsy();
    } finally {
      await client.close();
    }
  });

  test('US-62: a revoked token gets 401', async ({ page, baseURL }) => {
    const token = await issueTokenViaUI(page, 'e2e-revoke');
    expect(token).toMatch(/^tt_pat_/);

    // Close the "token shown once" view using the "Zavřít" button (hardcoded in
    // CreateTokenDialog when plaintext is visible).
    await page.getByRole('button', { name: 'Zavřít' }).click();

    // Reload so the page re-fetches the token list from the server.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'API tokeny', level: 1 })).toBeVisible();

    // Revoke via the table row's "Zrušit" button — opens a ConfirmModal
    // whose default danger-tone confirm label is "Smazat".
    await page.locator('table').getByRole('button', { name: 'Zrušit' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Smazat' }).click();

    // Wait for the badge to switch to "Zrušený" to confirm the revocation took effect.
    await expect(page.getByText('Zrušený')).toBeVisible();

    // POST to /api/mcp with the revoked token — must return 401.
    const r = await page.request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(r.status()).toBe(401);
  });
});
