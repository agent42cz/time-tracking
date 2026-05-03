import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@tt/web',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 180_000,
    server: {
      deps: {
        external: ['argon2', '@prisma/client'],
      },
    },
  },
});
