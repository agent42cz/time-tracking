# 0004 — tRPC for the API layer

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** PRD §11, BUILD-PROMPT §4 (now in [`../constitution.md`](../constitution.md))

## Context

PRD §11 says "Next.js route handlers + tRPC (or REST, TBD)." The original BUILD-PROMPT §4 picked tRPC. The web app and Chrome extension both consume the same backend — having one client-shape generator across both surfaces removes a large class of typo / shape-drift bugs.

## Decision

Use tRPC v11 for the application API layer, alongside a small surface of plain Next.js route handlers for things tRPC isn't a natural fit for (`/api/health`, file exports, OAuth callbacks).

## Alternatives considered

### Alternative A — REST with hand-written types

Rejected. Two clients (web + extension) duplicating the same client wrappers, and contract drift would surface as runtime errors instead of typecheck failures.

### Alternative B — GraphQL

Rejected. The PRD's data shape is small and the dashboard aggregates run as services, not federated resolvers. GraphQL's schema work would dwarf the actual feature work.

## Consequences

### Positive

- End-to-end type safety; the extension and the web app share the same router types.
- Easy to add procedures incrementally, alongside server actions for form posts.

### Negative

- One more layer of abstraction over plain route handlers. If a route is _only_ a route handler (e.g., `/api/health`), don't tRPC it.

### Neutral

- tRPC v11 supports both server actions and route handlers — we use both depending on which is ergonomic for the call site.
