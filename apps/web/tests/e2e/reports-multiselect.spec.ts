import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXTRA = 10;
const PREFIX = 'ZZZ MultiSelect';

let prisma: PrismaClient;
let createdIds: string[] = [];

test.beforeAll(async () => {
  const world = JSON.parse(await readFile(join(__dirname, '.auth', 'world.json'), 'utf8')) as {
    companyId: string;
  };

  prisma = new PrismaClient();
  await prisma.$connect();
  for (let i = 0; i < EXTRA; i++) {
    const c = await prisma.client.create({
      data: { companyId: world.companyId, name: `${PREFIX} ${i}`, sortOrder: 100 + i },
    });
    createdIds.push(c.id);
  }
});

test.afterAll(async () => {
  await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
  createdIds = [];
  await prisma.$disconnect();
});

test.describe('US-98: reports client filter', () => {
  test('US-98: the popover escapes its clipping ancestors and scrolls', async ({ page }) => {
    await page.goto('/reports');

    await page.getByRole('button', { name: /všichni klienti/i }).click();
    const popover = page.getByTestId('multiselect-popover');
    await expect(popover).toBeVisible();

    // 1. It is portalled to <body>, so no ancestor can clip it.
    const parentIsBody = await popover.evaluate((el) => el.parentElement === document.body);
    expect(parentIsBody).toBe(true);

    // 2. It is positioned against the viewport, not a containing block.
    const position = await popover.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');

    // 3. With 12 clients the option list actually overflows and can scroll.
    const list = popover.getByTestId('multiselect-listbox');
    const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // 4. The last option is reachable by scrolling the listbox.
    const last = popover.getByText(`${PREFIX} ${EXTRA - 1}`);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test('US-98: the popover repositions when the trigger grows from chip wrap', async ({ page }) => {
    // A tall viewport keeps the popover anchored *below* the trigger (`top:
    // trigger.bottom + GAP`) instead of flipping above it. The flip-up anchor
    // (`bottom: viewport height - trigger.top + GAP`) only depends on the
    // trigger's *top*, which doesn't move as it wraps, so it wouldn't exercise
    // the bug this test guards. The below-anchor depends on trigger.bottom,
    // which does move as chips wrap — that's the real regression path.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/reports');

    // The sidebar nav also has a "Klienti" link, so scope through the actual
    // <label> in the filters form (not associated via htmlFor, so match by
    // structure: the label's own parent also contains the MultiSelect trigger).
    const clientField = page.locator('label', { hasText: 'Klienti' }).locator('..');
    const trigger = clientField.locator('button[aria-expanded]');
    const triggerBefore = await trigger.boundingBox();
    if (!triggerBefore) throw new Error('client trigger not found');

    await trigger.click();
    const popover = page.getByTestId('multiselect-popover');
    await expect(popover).toBeVisible();

    // Tick 4 of the seeded long-named clients — verified empirically to wrap
    // the flex-wrap, min-h-[38px] trigger from one line (~38px) to ~3 lines
    // (~106px). Stop at 4: ticking further would scroll the popover's own
    // listbox to bring later options into view, which fires the *existing*
    // capture-phase `scroll` listener and would mask whether the new
    // ResizeObserver (this test's actual target) is doing anything.
    for (let i = 0; i < 4; i++) {
      await popover.getByText(`${PREFIX} ${i}`, { exact: true }).click();
    }

    const triggerAfter = await trigger.boundingBox();
    if (!triggerAfter) throw new Error('client trigger not found after selection');
    // Sanity check: the trigger actually grew (i.e. this test exercises wrap).
    expect(triggerAfter.height).toBeGreaterThan(triggerBefore.height);

    const popoverAfter = await popover.boundingBox();
    if (!popoverAfter) throw new Error('popover not found after selection');

    // The popover must still sit just under the now-taller trigger, not at the
    // stale gap computed against the trigger's original (shorter) height.
    const GAP = 4;
    const TOLERANCE = 2;
    const gap = popoverAfter.y - (triggerAfter.y + triggerAfter.height);
    expect(gap).toBeGreaterThanOrEqual(GAP - TOLERANCE);
    expect(gap).toBeLessThanOrEqual(GAP + TOLERANCE);
  });
});
