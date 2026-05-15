// Stub for 'server-only' in vitest. The real package throws when imported
// outside a Next.js Server Component. In the test environment all modules
// run in plain Node, so we replace the guard with a no-op.
export {};
