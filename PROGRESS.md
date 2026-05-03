# Build progress log

Append-only. One entry per phase per the build prompt.

## Phase 0 — Repository bootstrap

- Started: 2026-05-03
- Scope: pnpm workspaces, TypeScript strict everywhere, ESLint flat config (with no-only-tests + no-console-in-src custom rules), Prettier, Husky pre-commit + lint-staged, root scripts (`test`, `test:trace`, `test:e2e`, `test:e2e:ext`, `test:all`, `lint`, `typecheck`, `build`), `docker-compose.dev.yml` with Postgres 16 + Redis 7 + MailHog, `.github/workflows/ci.yml`, app/package skeletons, `scripts/test-trace.ts` (US coverage tracker against PRD §13).
- Layout: `apps/{web,ws,extension}` + `packages/{db,shared,ui}` per BUILD-PROMPT.md §5.
- US covered: none yet (this is bootstrap only).
