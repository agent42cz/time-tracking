# Healthcheck

The `web` app exposes a single liveness probe used by Coolify and any external monitoring (e.g., Beszel).

## Endpoint

`GET /api/health` — implemented at [`../../apps/web/src/app/api/health/route.ts`](../../apps/web/src/app/api/health/route.ts).

## Response shape

Healthy:

```json
{ "db": "ok", "redis": "ok" }
```

Returns HTTP **200**.

Degraded (one or both deps down):

```json
{ "db": "ok", "redis": "error: connection refused" }
```

Returns HTTP **503** — Coolify will mark the container unhealthy and (depending on platform settings) restart it.

## What it checks

- **Postgres** — issues `SELECT 1` via the Prisma client.
- **Redis** — `PING`.

It does **not** check WebSocket fan-out or SMTP. Add probes there if a related incident motivates one.

## Troubleshooting

- `db: error: ...` — Postgres container is down or `DATABASE_URL` is wrong. Check `docker compose ps`.
- `redis: error: ...` — Redis container is down or `REDIS_URL` is wrong. WS sync will not work even if `web` returns the page.
- HTTP 200 but the UI shows stale state — `web` is fine; the issue is likely in `apps/ws` or the Redis pub/sub channel. Check `apps/ws` logs.
