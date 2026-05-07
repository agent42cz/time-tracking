# 0003 — Use Auth.js v5 (NextAuth 5 beta)

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** PRD §11, [ADR-0002](0002-argon2id-for-passwords.md)

## Context

PRD §11 specifies "Auth.js" but does not disambiguate v4 vs. v5. We are on Next.js 15 with the App Router. v4 of NextAuth is in maintenance mode for the App Router and routing primitives changed substantially; v5 is the production-recommended path despite its `5.0.0-beta.x` versioning.

## Decision

Use NextAuth 5 (`next-auth@beta`) with `@auth/prisma-adapter` for storage. Wire credentials + magic link providers; layer custom TOTP on top via `otplib`.

## Alternatives considered

### Alternative A — NextAuth v4

Rejected. v4 is unmaintained for App Router and would require workarounds for route handlers and middleware. Using it now means migrating later.

### Alternative B — Roll our own auth on top of `iron-session` / `lucia`

Rejected. Auth.js gives us a sane provider model, the database adapter is well-tested, and we need to stay close to the PRD's "Auth.js (NextAuth)" line. Custom auth would also lose the `verifyRequest` / `session` callbacks we use elsewhere.

## Consequences

### Positive

- App Router-native; works with route handlers and Server Components.
- Database adapter handles `Account`, `Session`, `VerificationToken` tables for free.
- TOTP is layered on top — Auth.js doesn't ship 2FA, but its callback hooks make adding a step trivial.

### Negative

- Beta versioning means breaking changes between minor releases. Lock the exact version in `package.json` and bump deliberately.

### Neutral

- The Prisma adapter's tables coexist with our app-specific helper tables (`MagicLink`, `PasswordLoginAttempt`, `TotpRecoveryCode`).
