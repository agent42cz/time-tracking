import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tt/ws',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
