# 0006 — `expose:` over `ports:` in Coolify production compose

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** [`../operations/coolify-deploy.md`](../operations/coolify-deploy.md), original BUILD-PROMPT §6 Phase 10

## Context

Coolify uses Traefik as an ingress controller. If a Compose service binds host ports `80` or `443` (or any port Coolify's Traefik wants to use), the deploy fails or the service becomes unreachable. This is the canonical Coolify gotcha — easy to hit, easy to misdiagnose. The original BUILD-PROMPT explicitly called this out for Phase 10.

## Decision

Production `docker-compose.yml` declares **only** `expose:` for service ports — never `ports:`. Coolify's Traefik attaches Traefik labels to the `web` service and routes externally; internal service-to-service traffic uses Compose's default bridge network.

## Alternatives considered

### Alternative A — Bind `web` to `3000` and `ws` to `3001` on the host

Rejected. Collides with Traefik. Even when it doesn't, it forces Coolify out of the routing path and breaks the HTTPS pipeline.

### Alternative B — Run a sidecar reverse proxy inside the stack

Rejected. Coolify already provides one. Stacking proxies adds latency and complexity for no gain.

## Consequences

### Positive

- Deploys cleanly on Coolify with no port-collision debugging.
- HTTPS via Let's Encrypt is handled by Coolify's Traefik.

### Negative

- The stack cannot be brought up directly via `docker compose up` for an externally-reachable test without first standing up an ingress. For local smoke tests, use `docker-compose.dev.yml` instead.

### Neutral

- The dev compose file ([ADR-0005](0005-local-dev-port-offsets.md)) does bind host ports — the dev/prod difference is intentional.
