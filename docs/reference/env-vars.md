# Environment variables

Source of truth for development: [`../../.env.example`](../../.env.example). Production values live in the Coolify dashboard.

## Required in production

| Var                     | Purpose                                                                                      | Example                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string used by Prisma.                                                   | `postgresql://timetracker:***@postgres:5432/timetracker?schema=public` |
| `REDIS_URL`             | Redis connection string for WS pub/sub.                                                      | `redis://redis:6379`                                                   |
| `AUTH_SECRET`           | Auth.js session signing key. **Generate with `openssl rand -base64 32`.**                    | `<32-byte base64>`                                                     |
| `AUTH_URL`              | Public origin of the web app (used by Auth.js for callback URLs).                            | `https://tracker.example.com`                                          |
| `APP_URL`               | Public origin used in outbound emails (invite, magic link). Usually identical to `AUTH_URL`. | `https://tracker.example.com`                                          |
| `WS_PUBLIC_URL`         | Public `wss://` URL the browser connects to for real-time sync.                              | `wss://tracker.example.com/ws`                                         |
| `WS_PORT`               | Internal port for `apps/ws` (Coolify routes via Traefik).                                    | `3001`                                                                 |
| `SMTP_HOST`             | SMTP server hostname.                                                                        | `smtp.example.com`                                                     |
| `SMTP_PORT`             | SMTP port.                                                                                   | `587`                                                                  |
| `SMTP_USER`             | SMTP auth user.                                                                              |                                                                        |
| `SMTP_PASS`             | SMTP auth password.                                                                          |                                                                        |
| `SMTP_FROM`             | `From:` header on outbound mail.                                                             | `noreply@tracker.example.com`                                          |
| `POSTGRES_DB`           | DB name for the bundled Postgres service.                                                    | `timetracker`                                                          |
| `POSTGRES_USER`         | DB user.                                                                                     | `timetracker`                                                          |
| `POSTGRES_PASSWORD`     | DB password.                                                                                 |                                                                        |
| `BACKUP_DESTINATION`    | Volume path for nightly Postgres dumps inside the `db-backup` service.                       | `/backups`                                                             |
| `BACKUP_RETENTION_DAYS` | Days to keep dumps before pruning. Default `14`.                                             | `14`                                                                   |

## Local development

`pnpm db:up` brings up the dev stack on host-friendly ports (Postgres 5433, Redis 6380, MailHog 1025/8025). Copy [`../../.env.example`](../../.env.example) to `.env` and adjust if you have other Postgres/Redis instances on the host. The port offsets are deliberate — see [`../decisions/0005-local-dev-port-offsets.md`](../decisions/0005-local-dev-port-offsets.md).

## CI

`.github/workflows/ci.yml` injects these via job-level `env:` blocks. The `cd` job additionally requires:

- `COOLIFY_API_TOKEN` — Coolify API token used to trigger deploys after a successful CI run on `main`. The deploy step polls the deployment status for up to 15 minutes.
