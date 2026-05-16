# Architecture Decision Records

Append-only log. Once an ADR is merged, **never edit it**. Supersede with a new ADR whose status references the original.

## Index

- [ADR-0001 — Pin pnpm to a specific version](0001-pin-pnpm-version.md) — _Accepted, 2026-05-03_
- [ADR-0002 — Use argon2id for password hashing](0002-argon2id-for-passwords.md) — _Accepted, 2026-05-03_
- [ADR-0003 — Use Auth.js v5 (NextAuth 5 beta)](0003-auth-js-v5.md) — _Accepted, 2026-05-03_
- [ADR-0004 — tRPC for the API layer](0004-trpc-for-api-layer.md) — _Accepted, 2026-05-03_
- [ADR-0005 — Local dev port offsets to avoid host collisions](0005-local-dev-port-offsets.md) — _Accepted, 2026-05-03_
- [ADR-0006 — `expose:` over `ports:` in Coolify production compose](0006-coolify-expose-not-ports.md) — _Accepted, 2026-05-03_
- [ADR-0009 — Auto-stack overlapping entries](0009-auto-stack-overlapping-entries.md) — _Accepted, 2026-05-16_

## Writing a new ADR

Copy [`_template.md`](_template.md) to `NNNN-short-kebab-title.md` (zero-padded `NNNN`, monotonically increasing). Fill it in. Add a line to the index above. The ADR explains:

- **Context** — what constraints forced the decision?
- **Decision** — what we chose, in one or two sentences.
- **Alternatives** — at least 2, with brief reasons for rejection.
- **Consequences** — positive, negative, neutral.

If you change a previously-decided thing, do **not** edit the existing ADR. Write a new one with `Status: Supersedes ADR-XXXX` and explain why.
