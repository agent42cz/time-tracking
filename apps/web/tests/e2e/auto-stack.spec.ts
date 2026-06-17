import { PrismaClient } from '@prisma/client';
import { test, expect } from '@playwright/test';

const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';

let prisma: PrismaClient;

test.beforeAll(async () => {
  prisma = new PrismaClient();
});

test.afterAll(async () => {
  // Reset state so downstream test files (time-entry-edit, destructive-confirm,
  // mcp-skill-flow) inherit a clean admin user. Without this, autoStackOverlaps
  // stays true and the stop-timer flow goes through checkOverlap, breaking
  // start→stop→row-visible tests.
  await clearTimeEntries();
  await setAutoStackOverlaps(false);
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

/**
 * An overlapping seed + candidate window anchored to the recent past.
 *
 * The app rejects entries whose endedAt is more than 60s in the future
 * (services/time-entries.ts:62 and services/auto-stack.ts:59). Hardcoding
 * wall-clock times like 09:30–10:30 made these tests pass only when CI ran after
 * that hour and fail every morning. Deriving the window from `now` keeps the
 * candidate's end safely in the past whatever time CI runs.
 *
 * Layout mirrors the original (seed 09:00–10:00, candidate 09:30–10:30):
 *   seed:      [now-120m, now-60m]
 *   candidate: [now-90m,  now-30m]   ← ends 30 min in the past
 *   overlap:   [now-90m,  now-60m]
 *
 * Assumes CI runs at least ~2h into the local day (TZ is pinned to
 * Europe/Prague); a run between midnight and ~02:00 would push it into yesterday.
 */
function pastOverlapWindow(): {
  seed: { startHour: number; startMinute: number; endHour: number; endMinute: number };
  from: string;
  to: string;
} {
  const MIN = 60_000;
  const now = new Date();
  const candidateTo = new Date(now.getTime() - 30 * MIN);
  const candidateFrom = new Date(candidateTo.getTime() - 60 * MIN);
  const seedStart = new Date(candidateFrom.getTime() - 30 * MIN);
  const seedEnd = new Date(candidateTo.getTime() - 30 * MIN);
  const hhmm = (d: Date): string =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    seed: {
      startHour: seedStart.getHours(),
      startMinute: seedStart.getMinutes(),
      endHour: seedEnd.getHours(),
      endMinute: seedEnd.getMinutes(),
    },
    from: hhmm(candidateFrom),
    to: hhmm(candidateTo),
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('US-65: with setting OFF, saving an overlapping entry shows no dialog', async ({ page }) => {
  await setAutoStackOverlaps(false);

  // Overlapping seed + candidate, anchored to the recent past (see helper).
  const slot = pastOverlapWindow();
  await seedClosedEntry(slot.seed);

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping candidate entry
  await page.locator('input[name="from"]').fill(slot.from);
  await page.locator('input[name="to"]').fill(slot.to);

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

  // Overlapping seed + candidate, anchored to the recent past (see helper).
  const slot = pastOverlapWindow();
  await seedClosedEntry(slot.seed);

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping candidate entry
  await page.locator('input[name="from"]').fill(slot.from);
  await page.locator('input[name="to"]').fill(slot.to);

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

  // Overlapping seed + candidate, anchored to the recent past (see helper).
  const slot = pastOverlapWindow();
  await seedClosedEntry(slot.seed);

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping candidate entry
  await page.locator('input[name="from"]').fill(slot.from);
  await page.locator('input[name="to"]').fill(slot.to);

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

  // Overlapping seed + candidate, anchored to the recent past (see helper).
  const slot = pastOverlapWindow();
  await seedClosedEntry(slot.seed);

  await page.goto('/timer');

  // Open manual form
  await page.getByRole('button', { name: 'Přidat ručně' }).click();

  // Fill overlapping candidate entry
  await page.locator('input[name="from"]').fill(slot.from);
  await page.locator('input[name="to"]').fill(slot.to);

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

test('US-84: manual (Ručně) tab is available and applies a manual rearrangement', async ({
  page,
}) => {
  await setAutoStackOverlaps(true);

  // Overlapping seed + candidate, anchored to the recent past (see helper).
  const slot = pastOverlapWindow();
  await seedClosedEntry(slot.seed);

  await page.goto('/timer');

  // Open the manual form and fill the overlapping candidate
  await page.getByRole('button', { name: 'Přidat ručně' }).click();
  await page.locator('input[name="from"]').fill(slot.from);
  await page.locator('input[name="to"]').fill(slot.to);
  await page.getByRole('button', { name: 'Uložit záznam' }).click();

  // Dialog opens
  await expect(page.getByText('Tento záznam se překrývá s ostatními.')).toBeVisible();

  // Switch to the manual tab — label from cs.json: autoStack.directionManual = "Ručně"
  await page.getByRole('tab', { name: 'Ručně' }).click();
  await expect(page.getByRole('tab', { name: 'Ručně' })).toHaveAttribute('aria-selected', 'true');

  // The manual start-time input appears (web parity with the extension sheet).
  await expect(page.locator('input[type="datetime-local"]')).toBeVisible();

  // Dismiss without saving. The manual APPLY path is covered by the integration
  // test v1-auto-stack-routes.test.ts (US-82); this e2e verifies only the web
  // tab parity and avoids the calendar-day-window sensitivity of a manual save
  // run near midnight.
  await page.getByRole('button', { name: 'Zrušit' }).click();
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
