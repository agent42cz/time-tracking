import { test, expect } from '@playwright/test';

test.describe('US-54: edit time entry', () => {
  test("US-54: user opens Edit on today's entry, changes end, sees updated duration", async ({
    page,
  }) => {
    await page.goto('/timer');

    const description = `e2e edit ${Date.now()}`;
    // Actual label text in TimerStartCard is "Co děláte?" not "Popis činnosti"
    await page.getByLabel('Co děláte?').fill(description);
    // Actual button text is "▶ Spustit"
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Stop the timer immediately so the entry lands in the Today list.
    const stopButton = page.getByRole('button', { name: '■ Stop' }).first();
    await expect(stopButton).toBeVisible();
    // AIAGE-31 regression: the label "■ Stop" must fit — a square icon-sized
    // button (~32px) clips it. A real labelled button is ~70px wide.
    const stopBox = await stopButton.boundingBox();
    expect(stopBox?.width ?? 0).toBeGreaterThan(56);
    await stopButton.click();
    const row = page.locator('li').filter({ hasText: description });
    await expect(row).toBeVisible();

    // Edit button has title="Upravit" on the underlying <button> element
    await row.getByTitle('Upravit').click();
    // Dialog title comes from cs.json: timeEntry.edit.title = "Upravit záznam"
    await expect(page.getByText('Upravit záznam')).toBeVisible();

    // Shift the start backward by 1 hour so duration becomes 1h.
    // (Bumping end forward would land in the future and trigger future_timestamp.)
    const startInput = page.locator('#edit-entry-start');
    const currentStart = await startInput.inputValue();
    const s = new Date(currentStart);
    s.setHours(s.getHours() - 1);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const newStart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    await startInput.fill(newStart);

    // Save button text from cs.json: timeEntry.edit.save = "Uložit"
    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByText('Upravit záznam')).toBeHidden();

    // Start was shifted back exactly 1 hour, so the new duration must be "1h 0m".
    // The pre-edit duration is "0h 0m" (start ≈ stop), so an exact match here also
    // proves the save propagated rather than just falling through silently.
    await expect(row).toContainText('1h 0m');
  });

  test('US-54: user opens Edit on a running timer, fills end, timer disappears from running list', async ({
    page,
  }) => {
    await page.goto('/timer');
    const description = `e2e running-stop ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    // Running entries are rendered in divs; use .last() to select the innermost
    // (most-specific) matching div — multiple ancestor divs also match the filter.
    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
      .last();
    await expect(runningRow).toBeVisible();

    // Edit button has title="Upravit" on the <button> element
    await runningRow.getByTitle('Upravit').click();
    await expect(page.getByText('Upravit záznam')).toBeVisible();

    // Set start to 30 min in the past and end to 5 min in the past, both safely past.
    const startInput = page.locator('#edit-entry-start');
    const startValue = await startInput.inputValue();
    const base = new Date(startValue);
    const pad = (n: number): string => String(n).padStart(2, '0');

    // Start: 30 min before the timer was launched (definitely in the past)
    const pastStart = new Date(base);
    pastStart.setMinutes(pastStart.getMinutes() - 30);
    const startStr = `${pastStart.getFullYear()}-${pad(pastStart.getMonth() + 1)}-${pad(pastStart.getDate())}T${pad(pastStart.getHours())}:${pad(pastStart.getMinutes())}`;
    await startInput.fill(startStr);

    // End: 5 min before the timer was launched (in the past, after the new start)
    const pastEnd = new Date(base);
    pastEnd.setMinutes(pastEnd.getMinutes() - 5);
    const endStr = `${pastEnd.getFullYear()}-${pad(pastEnd.getMonth() + 1)}-${pad(pastEnd.getDate())}T${pad(pastEnd.getHours())}:${pad(pastEnd.getMinutes())}`;
    await page.locator('#edit-entry-end').fill(endStr);

    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByText('Upravit záznam')).toBeHidden();

    // Running row should be gone (timer stopped by filling end time)
    await expect(
      page
        .locator('div')
        .filter({ hasText: description })
        .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
        .last(),
    ).toHaveCount(0);

    // Entry should now appear in Today list (li)
    const todayRow = page.locator('li').filter({ hasText: description });
    await expect(todayRow).toBeVisible();
  });

  test('US-54: user opens Edit on a running timer, only shifts start, timer keeps running', async ({
    page,
  }) => {
    await page.goto('/timer');
    const description = `e2e running-shift ${Date.now()}`;
    await page.getByLabel('Co děláte?').fill(description);
    await page.getByRole('button', { name: '▶ Spustit' }).click();

    const runningRow = page
      .locator('div')
      .filter({ hasText: description })
      .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
      .last();
    await expect(runningRow).toBeVisible();

    await runningRow.getByTitle('Upravit').click();
    await expect(page.getByText('Upravit záznam')).toBeVisible();

    const startInput = page.locator('#edit-entry-start');
    const startValue = await startInput.inputValue();
    const s = new Date(startValue);
    // Shift start back by 35 minutes — extra buffer to avoid rounding-at-minute-boundary issues
    s.setMinutes(s.getMinutes() - 35);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const newStart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    await startInput.fill(newStart);
    // Leave end empty — dialog keeps end blank for running timers (required=false when wasRunning)

    await page.getByRole('button', { name: 'Uložit' }).click();
    await expect(page.getByText('Upravit záznam')).toBeHidden();

    // Timer should still be running — Stop button still visible in the row
    await expect(
      page
        .locator('div')
        .filter({ hasText: description })
        .filter({ has: page.getByRole('button', { name: '■ Stop' }) })
        .last(),
    ).toBeVisible();
  });
});
