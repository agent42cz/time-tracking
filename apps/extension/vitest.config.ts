import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tt/extension',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
  },
});
