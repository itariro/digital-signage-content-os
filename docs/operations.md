# Operations Guide

## Installation (instance)
1. Set `FRAME_MODE=instance`, `FRAME_DATA_DIR`, `FRAME_DB_PATH`.
2. Run the app (`npm run build && npm start` or kiosk service). Migrations run on startup.
3. Register the instance with the console: `POST /api/instances` (admin token) → returns `instanceId` + `deviceToken`.
4. Configure sync: set `SYNC_ENDPOINT`, `SYNC_TOKEN=<deviceToken>`, `INSTANCE_ID`, `SYNC_ENABLED=true`.

## Console admin
- `/console` requires a signed-in Clerk account; set `CONSOLE_ADMIN_ROLE` to additionally require that Clerk role.
- Instance management APIs (`/api/instances` GET/POST, revoke, config push, delete) accept a Clerk session or the `x-admin-token: $CONSOLE_ADMIN_TOKEN` header.
- `CONSOLE_ADMIN_TOKEN` unset means fail-closed in production (HTTP 500 `misconfigured`); in non-production it opens with audit actor `dev-admin`.
- Asset upload/delete/list require a credential (Clerk session, admin token, or device bearer). Asset files are served without credentials (frames embed them) but content types are derived from bytes and sanitized: unsanctioned types download as `application/octet-stream`, SVG renders as `text/plain`, everything carries `X-Content-Type-Options: nosniff`. Limits: 10 MiB/file, `ASSET_MAX_COUNT`, `ASSET_MAX_TOTAL_BYTES`.

## Backup
- Instance: copy `FRAME_DB_PATH` (+ `-wal`/`-shm`) and `FRAME_DATA_DIR/assets` while app stopped, or use snapshot helper.
- Console: standard Postgres backup (pg_dump).

## Restore
- Stop app, replace DB file with backup, restart. Integrity check runs on startup.

## Upgrade
- Pull new code, `npm install`, `npm run build`, restart. Migrations apply automatically.

## Rollback
- Restore previous build + DB backup. Keep last-known-good.

## Troubleshooting
- `SQLite integrity check failed`: restore from backup.
- Sync 410: instance too far behind; reset checkpoint (automatic full resync).
- Conflicts: inspect `/api/sync` status; resolve via console.

## Migration from hosted Postgres to instance
- Run `npx tsx scripts/migrate-pg-to-sqlite.ts` with `DATABASE_URL` and `FRAME_DB_PATH`.
EOF
echo done
## Postgres schema (console)
- Apply migrations with `npx drizzle-kit migrate` (drizzle/0000..0002). Do not rely on `drizzle-kit push`: until 0002 the migration set was missing 8 console tables and the frame_documents sync columns (revision/content_hash/updated_by).
