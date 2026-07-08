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
});
