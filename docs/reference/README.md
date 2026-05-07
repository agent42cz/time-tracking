# Reference

Functional reference material. These documents describe **what the system does** in concrete detail — data shapes, feature contracts, env vars, acceptance evidence.

## Contents

- [`data-model.md`](data-model.md) — Prisma entities, relations, cascade rules, soft-delete semantics.
- [`features.md`](features.md) — feature catalogue; every user story (US-1..US-50) with its scope and the tests that prove it.
- [`acceptance.md`](acceptance.md) — PRD §16 acceptance criteria mapped to the test files that prove each one.
- [`env-vars.md`](env-vars.md) — all environment variables (web + ws + db-backup), what each does, default vs. required.

## Where data shapes actually live

- **Prisma schema** — [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma) (source of truth).
- **Zod validators** — [`packages/shared/src/validators/`](../../packages/shared/src/validators/) (input validation at trust boundaries).
- **WS wire types** — [`packages/shared/src/ws/`](../../packages/shared/src/ws/) (real-time event payloads).

When the doc and the schema disagree, the schema wins. Update the doc.
