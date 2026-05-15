import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // Stub out Next.js' server-only guard — it throws if imported outside a
    // Server Component, but our service/server modules are plain Node code and
    // must be testable with vitest.
    alias: {
      'server-only': path.resolve(__dirname, 'src/__stubs__/server-only.ts'),
    },
  },
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
