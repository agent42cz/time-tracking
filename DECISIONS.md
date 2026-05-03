# Autonomous decisions log

Per BUILD-PROMPT.md §9: every decision the AI made under PRD ambiguity is logged here with rationale.

## 2026-05-03 — pnpm version pinning

PRD/BUILD-PROMPT do not pin a pnpm version.
Decision: pin to `pnpm@11.0.4` (current local version).
Reasoning: deterministic CI, matches dev environment.

## 2026-05-03 — Argon2id for password hashing

PRD §4.1 lists email+password but doesn't pick a hash.
Decision: `argon2` (id variant, default cost params).
Reasoning: OWASP top recommendation; better than bcrypt for new code; keeps a small native dep already available on Coolify Debian.

## 2026-05-03 — Auth.js v5 (NextAuth 5 beta)

PRD §11 says Auth.js but v4 vs. v5 unclear. v5 is required for App Router.
Decision: NextAuth 5 beta with `@auth/prisma-adapter`.
Reasoning: v4 is unmaintained for the App Router; the v5 beta is the production-recommended path.

## 2026-05-03 — tRPC for the API layer

PRD §11 says "tRPC or REST, TBD". BUILD-PROMPT §4 picks tRPC.
Decision: tRPC v11.
Reasoning: matches the lock in BUILD-PROMPT §4.

## 2026-05-03 — Local dev port offsets to avoid host collisions

Host machine may already use 5432 / 6379 for other Postgres / Redis instances.
Decision: dev compose binds Postgres to `5433` and Redis to `6380` on the host. CI keeps standard ports because the runner is ephemeral.
Reasoning: smallest footprint that lets `pnpm db:up` work next to other projects.

## 2026-05-03 — `expose` over `ports` in production compose (Coolify)

BUILD-PROMPT §6 Phase 10 explicitly calls this out.
Decision: production `docker-compose.yml` uses `expose:` only; Coolify Traefik routes internally.
Reasoning: avoids the documented Coolify gotcha where bound host ports collide with Traefik.

## 2026-05-03 — US coverage tracker = grep-based

PRD §14.5 demands `pnpm test:trace` reporting 100% US coverage.
Decision: `scripts/test-trace.ts` walks test files (`*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, anything under `tests/`) and looks for `\bUS-N\b`. Exits non-zero if any of US-1..US-50 has zero matches.
Reasoning: aligns with the PRD §14.5 convention "Test names embed the US ID". Simple, no extra deps.
