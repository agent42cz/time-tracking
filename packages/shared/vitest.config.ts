import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tt/shared',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
