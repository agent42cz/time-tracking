import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

const DEFAULT_DATABASE_URL =
  'postgresql://timetracker:timetracker@localhost:5433/timetracker?schema=public';
const DEFAULT_REDIS_URL = 'redis://localhost:6380';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    storageState: 'tests/e2e/.auth/admin.json',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-test-secret-do-not-use-in-production',
      AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      NODE_ENV: 'test',
      // Forwarded so specs can exercise live cross-tab sync (US-103). Left empty
      // by default: `useTimerSync` no-ops on a null url and the page falls back to
      // refetch-on-focus, which is what every other spec expects. Set it (and run
      // `apps/ws`) to run multi-tab-timer.spec.ts.
      WS_PUBLIC_URL: process.env.WS_PUBLIC_URL ?? '',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
