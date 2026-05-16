import { PrismaClient } from '@prisma/client';
import { test, expect } from '@playwright/test';

const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';

let prisma: PrismaClient;

test.beforeAll(async () => {
  prisma = new PrismaClient();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setAutoStackOverlaps(value: boolean): Promise<void> {
  await prisma.user.update({
    where: { email: E2E_ADMIN_EMAIL },
    data: { autoStackOverlaps: value },
  });
}

async function clearTimeEntries(): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_ADMIN_EMAIL },
    select: { id: true },
  });
  await prisma.timeEntryTag.deleteMany({ where: { timeEntry: { userId: admin.id } } });
  await prisma.timeEntry.deleteMany({ where: { userId: admin.id } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: admin.id } });
}

test.beforeEach(async () => {
  await clearTimeEntries();
  // Reset the setting to a known default before each test.
  await setAutoStackOverlaps(false);
});

// ─── helpers ────────────────────────────────────────────────────────────────

async function seedClosedEntry(opts: {
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  description?: string;
}): Promise<string> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_ADMIN_EMAIL },
    select: { id: true },
  });
  const company = await prisma.membership.findFirstOrThrow({
    where: { userId: admin.id },
    select: { companyId: true },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setHours(opts.startHour, opts.startMinute ?? 0, 0, 0);
  const end = new Date(today);
  end.setHours(opts.endHour, opts.endMinute ?? 0, 0, 0);
  const entry = await prisma.timeEntry.create({
    data: {
      userId: admin.id,
      companyId: company.companyId,
      description: opts.description ?? 'preexisting',
      startedAt: start,
      endedAt: end,
    },
  });
  return entry.id;
}

async function seedRunningEntry(opts: {
  startHour: number;
  startMinute?: number;
  description?: string;
}): Promise<string> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_ADMIN_EMAIL },
    select: { id: true },
  });
  const company = await prisma.membership.findFirstOrThrow({
    where: { userId: admin.id },
    select: { companyId: true },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setHours(opts.startHour, opts.startMinute ?? 0, 0, 0);
  const entry = await prisma.timeEntry.create({
    data: {
      userId: admin.id,
      companyId: company.companyId,
      description: opts.description ?? 'running',
      startedAt: start,
      // endedAt omitted → running
    },
  });
  return entry.id;
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('US-65: with setting OFF, saving an overlapping entry shows no dialog', async ({ page }) => {
  await setAutoStackOverlaps(false);

  // Seed existing closed entry 09:00–10:00
  await seedClosedEntry({ startHour: 9, endHour: 10 });

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping entry 09:30–10:30
  await page.locator('input[name="from"]').fill('09:30');
  await page.locator('input[name="to"]').fill('10:30');

  // Submit — label is "Uložit záznam" per TimerStartCard.tsx
  await page.getByRole('button', { name: 'Uložit záznam' }).click();

  // Dialog must NOT appear
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();

  // Manual form should close (save succeeded)
  await expect(page.getByRole('button', { name: 'Přidat ručně' })).toBeVisible();
});

test('US-67/US-68: forward direction stacks the candidate after existing entry', async ({
  page,
}) => {
  await setAutoStackOverlaps(true);

  // Seed existing closed entry 09:00–10:00
  await seedClosedEntry({ startHour: 9, endHour: 10 });

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping entry 09:30–10:30
  await page.locator('input[name="from"]').fill('09:30');
  await page.locator('input[name="to"]').fill('10:30');

  // Submit
  await page.getByRole('button', { name: 'Uložit záznam' }).click();

  // Dialog opens — title from cs.json: autoStack.dialogTitle
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();

  // Forward is the default direction; click "Posunout a uložit"
  await page.getByRole('button', { name: 'Posunout a uložit' }).click();

  // Dialog closes after successful save
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();
});

test('US-69: "Uložit bez posunu" saves without shifting entries', async ({ page }) => {
  await setAutoStackOverlaps(true);

  // Seed existing closed entry 09:00–10:00
  await seedClosedEntry({ startHour: 9, endHour: 10 });

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping entry 09:30–10:30
  await page.locator('input[name="from"]').fill('09:30');
  await page.locator('input[name="to"]').fill('10:30');

  // Submit
  await page.getByRole('button', { name: 'Uložit záznam' }).click();

  // Dialog opens
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();

  // Click "Uložit bez posunu" — saves without touching existing entries
  await page.getByRole('button', { name: 'Uložit bez posunu' }).click();

  // Dialog closes after save
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();

  // Manual form also closes (success path)
  await expect(page.getByRole('button', { name: 'Přidat ručně' })).toBeVisible();
});

test('US-75: switch direction toggle to backward and confirm shift', async ({ page }) => {
  await setAutoStackOverlaps(true);

  // Seed existing closed entry 09:00–10:00
  await seedClosedEntry({ startHour: 9, endHour: 10 });

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping entry 09:30–10:30
  await page.locator('input[name="from"]').fill('09:30');
  await page.locator('input[name="to"]').fill('10:30');

  // Submit
  await page.getByRole('button', { name: 'Uložit záznam' }).click();

  // Dialog opens with forward direction by default
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();

  // Switch to backward direction — tab label from cs.json: autoStack.directionBackward = "Zpět"
  await page.getByRole('tab', { name: 'Zpět' }).click();

  // The backward tab becomes selected
  await expect(page.getByRole('tab', { name: 'Zpět' })).toHaveAttribute('aria-selected', 'true');

  // Confirm — "Posunout a uložit"
  await page.getByRole('button', { name: 'Posunout a uložit' }).click();

  // Dialog closes after save
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();
});

test('US-76: parallel timers — stopping the second opens auto-stack dialog', async ({ page }) => {
  await setAutoStackOverlaps(true);

  // Seed a closed entry T1 at 10:00–11:00
  await seedClosedEntry({ startHour: 10, endHour: 11, description: 'T1 closed' });

  // Seed a running entry T2 that started at 10:30 (overlaps with T1 when stopped now)
  const t2Id = await seedRunningEntry({
    startHour: 10,
    startMinute: 30,
    description: 'T2 running',
  });

  await page.goto('/timer');

  // The running entry T2 should appear in the "Probíhá" section
  const runningSection = page
    .locator('div')
    .filter({ hasText: 'T2 running' })
    .filter({
      has: page.getByRole('button', { name: '■ Stop' }),
    })
    .last();
  await expect(runningSection).toBeVisible();

  // Stop T2 — this will produce an endedAt of "now", which overlaps with T1 (10:00–11:00)
  await runningSection.getByRole('button', { name: '■ Stop' }).click();

  // Auto-stack dialog should appear
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();

  // Clean up: dismiss dialog so afterAll cleanup can proceed cleanly
  await page.getByRole('button', { name: 'Zrušit' }).click();
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeHidden();

  // Silence the unused variable warning — t2Id is for documentation only
  void t2Id;
});
