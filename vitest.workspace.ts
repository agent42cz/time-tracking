import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'packages/*/package.json',
  'apps/*/vitest.config.ts',
]);
