# Coolify deployment

The production stack is `docker-compose.yml` at the repo root. It defines five services: `web`, `ws`, `postgres`, `redis`, `db-backup`.

## Critical invariant: `expose:`, not `ports:`

Services use `expose:` so Coolify's Traefik routes internally. **Never bind host ports** (`80`, `443`, `3000`) on the same node — they collide with Traefik. See [`../decisions/0006-coolify-expose-not-ports.md`](../decisions/0006-coolify-expose-not-ports.md) for the why.

## Required environment variables

Configure these in the Coolify dashboard. Full reference: [`../reference/env-vars.md`](../reference/env-vars.md).

| Var                                                             | Notes                                  |
| --------------------------------------------------------------- | -------------------------------------- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`             | Postgres credentials                   |
| `AUTH_SECRET`                                                   | `openssl rand -base64 32`              |
| `AUTH_URL` / `APP_URL`                                          | Public origin of the web app           |
| `WS_PUBLIC_URL`                                                 | Public `wss://` URL of the WS service  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Coolify-level SMTP                     |
| `BACKUP_DESTINATION`                                            | Volume path for nightly Postgres dumps |
| `BACKUP_RETENTION_DAYS`                                         | Default 14                             |

## Deploy steps

1. Connect the repo to Coolify.
2. Choose **Docker Compose** deployment, select `docker-compose.yml`.
3. Set the env vars above in the Coolify dashboard.
4. Coolify provisions Traefik labels for the `web` service. Point your domain at the Coolify host; Coolify handles HTTPS via Let's Encrypt.
5. The `db-backup` service writes daily dumps to `${BACKUP_DESTINATION}` on the host volume.
6. Healthcheck: `GET /api/health` returns `{ db: 'ok', redis: 'ok' }` with HTTP 200; 503 otherwise.

## CI-driven deploys

After CI is green on `main`, the `cd` job in `.github/workflows/ci.yml` calls the Coolify API:

1. POST to the deploy endpoint with the project's deploy token (`COOLIFY_API_TOKEN`).
2. Poll the deployment status every 10s, up to 15 min (90 attempts).
3. Fail the job if status is not `success` after the polling window.

The production URL is currently `https://tracker.agent42.cz` (configured in CI environment).

## Cloudflare Access in front of the app

If the app's hostname sits behind Cloudflare Access, the **Chrome extension stops working
entirely** — silently. Access answers every request that lacks its cookie with a 302 to
`https://<team>.cloudflareaccess.com/...`, a host the extension's `host_permissions` does
not cover, so Chrome kills the fetch. The extension cannot obtain that cookie: the service
worker polls with `credentials: 'omit'`, and the popup's origin is `chrome-extension://…`.
A Service Auth token is not usable either — the secret would ship inside the extension,
readable by anyone who unpacks it.

Required configuration: in **Zero Trust → Access → Applications → the app**, add a **Bypass**
policy covering `/api/v1/*` and the WebSocket endpoint (`WS_PUBLIC_URL`).

Understand what that buys and costs. Those paths are then reachable from the internet with
only the app's own authentication in front of them — opaque hashed bearer tokens in the
`sessions` table (ADR-0014), which is what the extension authenticates with anyway. Access
was never authenticating the extension; it was only blocking it. Leave Access on the
interactive routes (`/`, `/timer`, the admin pages), where a browser can complete the login.

Symptoms of getting this wrong are documented in `docs/gotchas.md` (2026-09-03) and were
diagnosed as AIAGE-66. The same interception already bit the CI deploy job — see the
`CF_ACCESS_CLIENT_ID` comments in `.github/workflows/ci.yml`.

## First-run bootstrap

The first user is created via the seed (run from a host that can reach the running `web` container):

```bash
docker compose run --rm web node packages/db/dist/seed.js
```

Alternative: connect to the `web` service shell and create an `Invite` row directly via a Prisma script, then visit the invite URL to register.
