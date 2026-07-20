import { defineConfig, devices } from '@playwright/test';
import { VIEWPORT } from './tests/e2e/fixtures.js';

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

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
  },
  // Serve the BUILT bundle: this is what catches a workspace-package
  // resolution regression when Task 3 imports @tt/shared.
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `${BASE_URL}/popup.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // Project-level `use` merges OVER top-level `use`, and devices['Desktop
  // Chrome'] carries its own 1280x720 viewport — so the popup viewport must
  // be set here, not just at the top level, or every test runs at desktop
  // size instead of the actual popup size.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } }],
});
