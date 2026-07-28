# 0014 — Drop the unused Auth.js dependencies

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Michal Lénert
- **Related:** [`0012-prisma-migrate-deploy-over-db-push.md`](0012-prisma-migrate-deploy-over-db-push.md)

## Context

`docs/constitution.md` lists "Auth.js v5 with credentials + magic link providers +
custom TOTP layer" as part of the locked stack, and `apps/web/package.json` declared
`next-auth@5.0.0-beta.25`, `@auth/core@^0.37.4` and `@auth/prisma-adapter@^2.7.4`.

**Nothing imported any of them.** A repo-wide search across `apps/`, `packages/`,
`scripts/` and `docker/` — every `.ts`, `.tsx`, `.mjs`, `.js` and config file —
returns zero references to `next-auth`, `@auth/core`, `@auth/prisma-adapter` or
`NextAuth`. There is no `middleware.ts`, and `next.config.mjs` does not touch auth.

Authentication is entirely hand-rolled and always has been:

- `apps/web/src/lib/auth/sessions.ts` — server-side sessions with sliding renewal,
  opaque tokens hashed into the `sessions` table
- `apps/web/src/lib/auth/login.ts`, `lib/session.ts`, `lib/api/auth.ts` — password
  login with lockout, magic link, TOTP, recovery codes
- `apps/ws/src/server.ts` — resolves the same `tt-session` cookie against the same table

The three packages were dead weight, and they were not harmless. `pnpm audit --prod`
attributed **two criticals and two highs** to them, including an Auth.js advisory where
"configuration errors can cause existence-based auth checks to pass" — an advisory
against a library this app never configures, let alone relies on.

`@auth/core` also pulled `nodemailer` transitively, which obscured that
`apps/web/src/lib/email.ts` depends on it directly.

## Decision

Remove `next-auth`, `@auth/core` and `@auth/prisma-adapter` from `apps/web`.

Keep `nodemailer` as a direct dependency of `apps/web` and bump it `^6.9.16 → ^9.0.1`;
`email.ts` uses only `createTransport` and `sendMail`, whose signatures are unchanged.

Correct the documentation. The constitution, `CLAUDE.md`, `docs/architecture/README.md`
and `apps/web/src/lib/DESCRIPTION.md` all described an Auth.js integration that does not
exist. The locked-stack entry becomes "custom server-side sessions", and the prohibition
it carries — no Clerk / WorkOS / Supabase Auth — is retained, because that was the real
intent.

## Consequences

- 73 → 23 advisories overall; **criticals 5 → 0**, highs 22 → 6. The rest are
  transitive under `next` and `@modelcontextprotocol/sdk`, both bumped as far as their
  majors allow (`next` 15.1.3 → 15.5.22, MCP SDK → ^1.30.0).
- No behaviour change. Nothing imported the removed packages, and the full suite
  confirms it: 48 unit files / 300 tests and 34/34 Playwright e2e — including every
  login, magic-link, TOTP and session flow — pass unchanged.
- `AUTH_SECRET` and `AUTH_URL` keep their names and meaning. They are read by the app's
  own code, not by Auth.js; `docs/reference/env-vars.md` no longer credits Auth.js for
  them.
- The `User`, `Account`, `Session` and `VerificationToken` tables retain their
  Auth.js-shaped columns. They are managed by Prisma and used by the custom code, so
  this ADR does not touch them; renaming them would be a data migration for cosmetic
  gain.
- **This is not permission to adopt a different auth library.** Swapping the custom
  implementation for a third-party one still requires its own ADR.

## Note on how this was missed

The stack was documented from the plan, not from the code, and never re-checked. The
lesson generalises: a dependency listed in `package.json` and named in an architecture
doc is not evidence that it runs. Grep for importers before trusting either. The same
check surfaced `packages/shared`'s `createWsClient`, which was exported and unimported
for months until AIAGE-57 finally wired it into the web app.
