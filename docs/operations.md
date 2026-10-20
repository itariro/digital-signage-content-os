# Operations Guide

## Installation (instance)
1. Set `FRAME_MODE=instance`, `FRAME_DATA_DIR`, `FRAME_DB_PATH`.
2. Run the app (`npm run build && npm start` or kiosk service). Migrations run on startup.
3. Register the instance with the console: `POST /api/instances` (admin token) → returns `instanceId` + `deviceToken`.
4. Configure sync: set `SYNC_ENDPOINT`, `SYNC_TOKEN=<deviceToken>`, `INSTANCE_ID`, `SYNC_ENABLED=true`.

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