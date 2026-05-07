# Backups

The `db-backup` service in `docker-compose.yml` writes a nightly Postgres dump and prunes old ones.

## How it runs

- Cron inside the `db-backup` container fires once per day.
- `pg_dump` writes to `${BACKUP_DESTINATION}` (host-mounted volume in Coolify).
- Files older than `${BACKUP_RETENTION_DAYS}` (default `14`) are deleted.

Filenames follow the pattern `timetracker-YYYYMMDD-HHMMSS.sql.gz`.

## Restore

1. Stop the `web` and `ws` services so no writes hit Postgres mid-restore.
2. Drop and re-create the database (or restore into a temp DB and rename).
3. `gunzip < backup-file.sql.gz | psql -U $POSTGRES_USER $POSTGRES_DB`.
4. Restart `web` and `ws`.

If the restore is into the same Postgres container, use `docker compose exec postgres psql ...` so the `${POSTGRES_PASSWORD}` is picked up.

## Verification

- Tail the backup container logs (`docker compose logs db-backup`) — successful runs print the dump path and pruned counts.
- Periodically test a restore into a scratch environment. A backup that has never been restored is a wish, not a backup.
