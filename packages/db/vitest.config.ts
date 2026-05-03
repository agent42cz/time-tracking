import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tt/db',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
