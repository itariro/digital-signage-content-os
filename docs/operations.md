# Operations Guide

## Installation (instance)
1. Set `FRAME_MODE=instance`, `FRAME_DATA_DIR`, `FRAME_DB_PATH`.
2. Run the app (`pnpm build && pnpm start` or kiosk service). Migrations run on startup.
3. Register the instance with the console: `POST /api/instances` (admin token) → returns `instanceId` + `deviceToken`.
4. Configure sync: set `SYNC_ENDPOINT`, `SYNC_TOKEN=<deviceToken>`, `INSTANCE_ID`, `SYNC_ENABLED=true`.

## Console admin
- `/console` requires a signed-in Clerk account; set `CONSOLE_ADMIN_ROLE` to additionally require that Clerk role.
- Instance management APIs (`/api/instances` GET/POST, revoke, config push, delete) accept a Clerk session or the `x-admin-token: $CONSOLE_ADMIN_TOKEN` header.
- `CONSOLE_ADMIN_TOKEN` unset means fail-closed in production (HTTP 500 `misconfigured`); in non-production it opens with audit actor `dev-admin`.
- Asset upload/delete/list require a credential (Clerk session, admin token, or device bearer). Asset files are served without credentials (frames embed them) but content types are derived from bytes and sanitized: unsanctioned types download as `application/octet-stream`, SVG renders as `text/plain`, everything carries `X-Content-Type-Options: nosniff`. Limits: 10 MiB/file, `ASSET_MAX_COUNT`, `ASSET_MAX_TOTAL_BYTES`.

## Service worker (kiosk displays)
- The worker (`/sw.js`, cache `frame-v2`) never caches `/api/*`; navigations
  are network-first with an offline shell fallback; static assets
  stale-while-revalidate.
- Displays stuck on an old cache recover automatically: on activate the
  worker deletes every non-current cache. To force recovery remotely, restart
  the kiosk app so `/sw.js` re-registers; for a hard reset run in the kiosk
  console: `navigator.serviceWorker.getRegistrations().then(rs =>
  rs.forEach(r => r.unregister()))`, then reload.

## Backup
- Instance snapshots run automatically at startup before any migration
  (rotation keeps `BACKUP_MAX`, default 10, in `$FRAME_DATA_DIR/backups`).
  A corrupt database is restored from the latest snapshot at boot; with no
  backup available startup fails loudly instead of serving a broken db.
- Periodic cron: `0 * * * * cd /app && FRAME_DATA_DIR=/var/lib/frame pnpm dlx tsx scripts/snapshot.ts`
- Instance: copy `FRAME_DB_PATH` (+ `-wal`/`-shm`) and `FRAME_DATA_DIR/assets` while app stopped, or use snapshot helper.
- Console: standard Postgres backup (pg_dump).

## Restore
- Stop app, replace DB file with backup, restart. Integrity check runs on startup.

## Upgrade
- Pull new code, `pnpm install --frozen-lockfile`, `pnpm build`, restart. Migrations apply automatically.

## Rollback
- Restore previous build + DB backup. Keep last-known-good.

## Troubleshooting
- `SQLite integrity check failed`: restore from backup.
- Sync 410: instance too far behind; reset checkpoint (automatic full resync).
- Conflicts: inspect `/api/sync` status; resolve via console.

## Migration from hosted Postgres to instance
- Run `pnpm dlx tsx scripts/migrate-pg-to-sqlite.ts` with `DATABASE_URL` and `FRAME_DB_PATH`.

## Postgres schema (console)
- Apply migrations with `pnpm exec drizzle-kit migrate` (drizzle/0000..0003, latest: sync_queue.base_revision). Do not rely on `drizzle-kit push`: until 0002 the migration set was missing 8 console tables and the frame_documents sync columns (revision/content_hash/updated_by).
