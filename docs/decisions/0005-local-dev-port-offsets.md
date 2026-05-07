# 0005 — Local dev port offsets to avoid host collisions

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** [`../operations/local-development.md`](../operations/local-development.md), [ADR-0006](0006-coolify-expose-not-ports.md)

## Context

Many developers already run Postgres or Redis on the standard ports (5432, 6379) for other projects. Defaulting `docker-compose.dev.yml` to those ports would force a `pnpm db:down` on whatever else is running.

## Decision

The dev compose file binds Postgres to `5433` and Redis to `6380` on the host. CI keeps standard ports because the runner is ephemeral and there is nothing to collide with.

## Alternatives considered

### Alternative A — Use standard ports and document conflicts

Rejected. The point is "smallest footprint that lets `pnpm db:up` work next to other projects." Documenting a conflict is worse than avoiding one.

### Alternative B — Use random/published-by-Docker ports

Rejected. Then `DATABASE_URL` in `.env.example` can't have a stable value, and every contributor has to figure out the host port.

## Consequences

### Positive

- `pnpm db:up` is safe to run alongside any other Postgres/Redis on the host.
- `.env.example` ships with working values — first-time setup is `cp .env.example .env && pnpm db:up`.

### Negative

- Two extra env-var values for newcomers to internalize. Mitigated by the comment block at the top of `.env.example`.

### Neutral

- Production compose ([ADR-0006](0006-coolify-expose-not-ports.md)) doesn't bind host ports at all, so this offset only matters in dev.
