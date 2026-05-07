# `apps/ws/src`

> WebSocket fan-out service. Authenticates clients via session cookie or Bearer token, subscribes to `user:{id}` and `company:{id}` channels, forwards events from Redis pub/sub to subscribed sockets.

## Purpose

The web app's tRPC service layer publishes events to Redis after every mutation. The Chrome extension and any open web tabs hold WebSocket connections to _this_ service, which subscribes once to a Redis pattern (`psubscribe`) and routes incoming messages to the right sockets based on channel.

This service is intentionally small — it does not own state, it does not authenticate against Postgres directly for every message, and it does not duplicate the business logic that already lives in `apps/web/src/lib/services/`.

## Public surface

| File             | Responsibility                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`       | Process entry. Boots the WebSocketServer, wires Redis, starts listening on `WS_PORT`.                                                                 |
| `server.ts`      | Connection handler: authenticate, subscribe to channels, dispatch incoming Redis events, handle disconnects.                                          |
| `publish.ts`     | Helper used by `apps/web` to publish events to Redis. The shape (channel name, payload schema) is the contract this service consumes.                 |
| `server.test.ts` | Integration tests against testcontainers Postgres + Redis. Verifies same-user fan-out within 1s and zero cross-company leak over a 3s window (US-31). |

## Channel model

Two channel families:

- `user:{userId}` — events scoped to a single user. The same user opening multiple tabs (or a tab + the extension) all subscribe to the same channel.
- `company:{companyId}` — events visible to every member of a company (e.g., admin-driven changes). Each socket subscribes to channels for the user's _active_ company; switching companies updates the subscription.

A single `psubscribe` matches both patterns; per-connection filtering decides which sockets receive a given message.

## Auth flow

1. Client connects with either a session cookie (web) or `?token=<sessionToken>` query (extension fallback).
2. `server.ts` validates the token against the session table via Prisma.
3. On success, the socket is bound to its `userId` and `activeCompanyId` and added to the connection registry.
4. On disconnect, the entry is removed.

If validation fails, the socket is closed with a 4401-class code so the client knows it's an auth issue (not a network blip).

## Dependencies

- **Internal:** `@tt/db` (Prisma client for session validation), `@tt/shared/ws` (wire types — both publish + consume).
- **External:** `ws` (`WebSocketServer`), `ioredis` (`psubscribe`).

## Used by

- `apps/web` — publishes to Redis via `publish.ts` after every mutation.
- `apps/extension` — connects to this service for live updates of running timers and weekly entries.
- Any open browser tab on the web app — uses the same client (`packages/shared/src/ws/client.ts`) with exp-backoff reconnect.

## Notes

- **No DB writes here.** This service reads (for session validation) and forwards. Anything that wants to mutate state should go through `apps/web`.
- **Cross-company isolation is verified explicitly.** The 3s zero-leak test in `server.test.ts` is the canonical assertion — don't weaken it for performance.
- **Reconnect is on the client** (`packages/shared/src/ws/client.ts`). The server itself doesn't need retry logic.
- **Coolify deploys** this service as a separate container (`ws` in `docker-compose.yml`) with `expose: 3001`. Traefik routes `wss://...` to it.
