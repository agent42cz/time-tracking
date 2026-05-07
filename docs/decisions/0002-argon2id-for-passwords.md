# 0002 — Use argon2id for password hashing

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** PRD §4.1, [ADR-0003](0003-auth-js-v5.md)

## Context

PRD §4.1 lists email + password as a login method but does not pick a hash. We need a memory-hard, modern KDF that the OWASP Password Storage Cheat Sheet currently recommends. The deployment target is Debian on Coolify, so a small native dep is acceptable.

## Decision

Use the `argon2` npm package's argon2id variant with the library's default cost parameters. Keep all hashing behind a thin helper in `apps/web/src/lib/auth/passwords.ts` so cost params can be tuned in one place.

## Alternatives considered

### Alternative A — bcrypt

Rejected. bcrypt is fine but is no longer the OWASP top recommendation, and its 72-byte input cap is a footgun. argon2id is the current default for new code.

### Alternative B — scrypt

Rejected. Memory-hard like argon2id but less commonly tuned in Node, and argon2id has stronger side-channel resistance.

## Consequences

### Positive

- OWASP-aligned default; modern reviewers won't flag it.
- argon2id is memory-hard, which raises the cost of GPU-based offline attacks.

### Negative

- Native dep needs to compile. Mitigated by adding `argon2: true` to `pnpm-workspace.yaml`'s `allowBuilds`.

### Neutral

- Hash format embeds cost params, so future cost tuning doesn't require backfill — old hashes verify against their original params.
