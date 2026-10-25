# Operations Guide

## Installation (instance)
1. Set `FRAME_MODE=instance`, `FRAME_DATA_DIR`, `FRAME_DB_PATH`.
2. Run the app (`pnpm build && pnpm start` or kiosk service). Migrations run on startup.
3. In the console, use "Add frame" (or `POST /api/instances`) to issue a one-time enrollment code. The code expires after 15 minutes and works once.
4. On the frame, run `sudo kiosk-ctl enroll <console-url> <CODE>`. It writes `/etc/dscos/frame.env` and restarts the app.
5. Lost the frame key? Call `POST /api/instances/<instanceId>/rotate` (or click "Reissue code" on the console card), then re-run `kiosk-ctl enroll` with the new code. Revoking an instance works the same as before (`DELETE /api/instances/<id>`).

## Frame enrollment and admin
- Enrollment requires an https console URL. Plain http is accepted only for loopback development (`localhost`, `127.0.0.1`, `::1`).
- Rotating a code invalidates every older code for that instance. Use the newest code.
- `sudo kiosk-ctl password <secret>` writes `FRAME_ADMIN_SECRET` and `FRAME_ADMIN_HASH` together in one atomic file update. It keeps a valid stored secret, otherwise uses a valid `FRAME_ADMIN_SECRET` from the environment, otherwise generates one. An invalid stored secret is replaced with a warning.
- A valid `FRAME_ADMIN_SECRET` is 32-128 base64url characters. If `FRAME_ADMIN_HASH` is set without a valid secret, the management surface stays read-only, login returns 401, and the display keeps running.
- Set `TRUST_PROXY=1` only behind a proxy that overwrites `x-forwarded-for`. Leave it unset on frames; unset means every client shares one rate-limit bucket.
- Invalid `KIOSK_MGMT_PORT` or `PORT` values are logged. No forwarder starts and the display is unaffected.
- Enrollment audit writes are best-effort: a failed insert logs the action and target but does not fail the request or lose a bundle.

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
- Apply migrations with `pnpm exec drizzle-kit migrate` (drizzle/0000..0004, latest: enrollment_codes). Do not rely on `drizzle-kit push`: until 0002 the migration set was missing 8 console tables and the frame_documents sync columns (revision/content_hash/updated_by).
