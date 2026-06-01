import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // Stub out Next.js' server-only guard — it throws if imported outside a
    // Server Component, but our service/server modules are plain Node code and
    // must be testable with vitest.
    alias: {
      'server-only': path.resolve(__dirname, 'src/__stubs__/server-only.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    name: '@tt/web',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Run test files sequentially. The integration tests share a single
    // testcontainers Postgres (connection-pool starvation otherwise) and
    // some `server/mcp/` modules keep per-process state in `globalThis`
    // (rate-limit buckets) that would leak across parallel files.
    fileParallelism: false,
    server: {
      deps: {
        external: ['argon2', '@prisma/client'],
      },
    },
  },
});
