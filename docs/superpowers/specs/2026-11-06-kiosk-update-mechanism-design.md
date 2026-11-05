# Kiosk Update Mechanism — Design Spec

**Date:** 2026-11-06
**Sub-project:** 2 of 3 (update mechanism)
**Depends on:** sub-project 1 (CLI robustness)

## Goal

Enable a frame to detect and apply updates from GitHub releases, both
manually (`kiosk update check/apply/rollback`) and automatically via a
daily systemd timer, covering app code and installer/runtime scripts.

## Non-goals

- Release automation / drafting release notes (sub-project 3).
- Delta updates.

## Update source

GitHub releases on `itariro/digital-signage-content-os`. Asset:
`dscos-<version>.tar.gz` containing the prebuilt app (`.next`, `package.json`,
`node_modules`? no — only `.next` + source + `package.json`) plus installer
scripts. Release tag `v<semver>` (e.g. `v0.9.0`).

## Version tracking

- App version: `package.json` `version` in app dir (`DSCOS_APP_DIR` or
  `/opt/dscos`).
- Installer/runtime version: `INSTALLER_VERSION` constant in
  `install-kiosk.sh` (currently `2.0`), written to `/etc/kiosk/installer.version`
  during install.
- A frame reports both; an update is available if either lags the release.

## Components

### 1. `kiosk update check`

- Query `https://api.github.com/repos/itariro/digital-signage-content-os/releases/latest`.
- Parse `tag_name` (strip leading `v`) → latest version.
- Read installed app version + installer version.
- Print JSON: `{ current, latest, updateAvailable, channel }`.
- Exit 0 if check succeeded (regardless of availability), 1 on network error.

### 2. `kiosk update apply [--version V]`

- Resolve target version (latest or specified).
- Download release asset to a staging dir `/var/lib/dscos/staging/<version>`.
- Validate: tarball extracts, `package.json` version matches, `.next` present.
- Switch: move current app dir to `/var/lib/dscos/backup/<prev>`, move
  staging to app dir. Update installer scripts in `/usr/local/lib/kiosk` and
  re-run relevant installer steps? (installer scripts updated from asset).
- Restart `dscos` service; health-check; rollback on failure.
- Update `/etc/kiosk/installer.version`.
- State persisted in `/var/lib/dscos/update-state.json`.

### 3. `kiosk update rollback`

- Restore from `/var/lib/dscos/backup/<lastKnownGood>` if present.
- Restart service; health-check.

### 4. Auto-update timer

- systemd unit `kiosk-update.service` (oneshot) running
  `kiosk update apply` (only if update available; apply handles no-op).
- systemd timer `kiosk-update.timer` running daily at 03:00 with
  `Persistent=true`.
- Installed by installer (new step) and by `kiosk update enable/disable`.

### 5. CLI additions

- `update enable` / `update disable` — toggle auto-update timer.
- `update status` — show timer state + last run.

## Safety

- Keep last known good backup; rollback on health failure.
- Atomic-ish switch via rename; if rename fails, abort before touching app.
- Never delete the only good copy until new one validated.
- Require `--yes` for apply on a TTY? Apply is non-interactive by default
  for cron; manual still prompts unless `--yes`.

## Files touched

- `lib/kiosk/cli.ts` — implement cmdUpdate fully.
- `lib/kiosk/updates.ts` — extend with fetch/apply helpers (or new
  `lib/kiosk/updater.ts`).
- `install-kiosk.sh` — install update timer units; write installer version.
- `lib/kiosk/__tests__/` — tests for update check/apply/rollback.
- `docs/kiosk-cli.md` — document update commands.

## Risks

- Network failures during download → retry, leave current intact.
- Disk space on 8 GB eMMC → check free space before staging.
- Partial download → validate checksum (GitHub provides sha256? use
  asset digest if available).
- Concurrency: lock file to prevent overlapping updates.
