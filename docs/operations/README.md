# Operations

How to run, deploy, monitor, and troubleshoot the system.

## Contents

- [`coolify-deploy.md`](coolify-deploy.md) — production deployment to Coolify on a Debian VPS.
- [`local-development.md`](local-development.md) — bringing up the dev stack and seeding a working environment.
- [`healthcheck.md`](healthcheck.md) — what `/api/health` reports and how to interpret failures.
- [`backups.md`](backups.md) — nightly Postgres dump cadence, retention, restore procedure.

## Where things run

- **Production target:** Coolify on a Debian VPS, fronted by Coolify-managed Traefik for HTTPS via Let's Encrypt.
- **Local target:** Docker Compose (`docker-compose.dev.yml`) for Postgres + Redis + MailHog, plus `pnpm dev` for the apps.
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) — CI on every push/PR; CD job triggers Coolify deploys via API on push to `main`.

## On-call quick reference

- Healthcheck: `GET /api/health` returns `{ db, redis }` with HTTP 200 (or 503 if either is down).
- Logs: structured JSON to stdout; Coolify exposes container logs in its dashboard.
- Backups: daily Postgres dump written to `${BACKUP_DESTINATION}` on the host volume, pruned at `${BACKUP_RETENTION_DAYS}` (default 14).
