# Kiosk Boot Resilience - Design

- **Date:** 2026-11-09
- **Status:** Approved design, awaiting spec review (brainstorming gate)
- **Scope:** Fix three runtime faults seen on `oculus-02` - app disabled after reboot,
  `surf` binary missing after update, and a stale browser that never reloads after an app restart.
  Also record the fresh-install `$3` class of bug so it stays fixed.
- **Related:** `docs/superpowers/specs/2026-11-07-surf-kiosk-optimization-design.md`,
  `docs/superpowers/specs/2026-11-08-frame-editor-auth-and-install-env-design.md`,
  `docs/kiosk-cli.md`

## 1. Problem (evidence from `oculus-02`)

### 1a. `dscos` disabled → black screen after reboot

`systemctl is-enabled dscos.service` returned `disabled`, `is-active` returned
`inactive`, port 3000 had no listener. Install log `2026-11-09 05:24` shows the
symlink *was* created twice, so enable worked at install time. Afterward the
symlink and `kiosk-update.timer` enablement are gone; standby timer unit
files (`kiosk-standby-*.timer`) are deleted entirely (symlinks in
`timers.target.wants` dangle). `journalctl -t kiosk` then logs:

```text
WARNING: http://127.0.0.1:3000/frame/home unreachable after 60s; starting browser anyway
browser started -> http://127.0.0.1:3000/frame/home
browser exited after 0s (rc=127)
```

in a 60 s + backoff loop. Frame shows Xorg (:0) + openbox + `xsetroot -solid
black` only.

### 1b. `surf` binary missing → black screen even with a healthy app

`which surf` found nothing, `dpkg` had `chromium` but no `surf`,
`/tmp/kiosk-surf.log` said `timeout: failed to run command '/usr/bin/surf':
No such file or directory`. `PACKAGES` switched `chromium` → `surf` in
v0.9.6 (`v0.9.5: chromium`, `v0.9.6: surf`). `--update-runtime` (run by
`kiosk update apply`) only calls `t_install_node`, `t_write_session`,
`t_write_ctl`, `t_getty`, `t_xinit`, `t_write_app_service`,
`t_write_update_timer`, `t_write_standby_scripts` - it never apt-installs.
A frame born on chromium (log: `chromium is already newest 156...`) that
updates to 0.9.7/0.9.8 gets a surf-expecting `session.sh` but never the
`surf` package. Every update since ships this trap.

### 1c. `kiosk app restart` does not refresh the browser

`cmdApp restart` is only `systemctl restart dscos`. It never touches surf.
`session.sh` relaunches surf only when its process dies. Surf has no
auto-reload, so a surf that loaded the URL while the app was down sits on
the failed page forever. After manual remediation the app was healthy
(`kiosk app health` → healthy, `/api/health` 200) while surf stayed down
until the session's next backoff tick. Killing surf (`pkill -TERM -u kiosk
-x surf`, what `kiosk-ctl restart` does) makes the supervisor respawn it in
~5 s with a fresh load gated by `wait_for_network`.

### 1d. Fresh install `$3: unbound variable`

`/etc/dscos/frame.env` line 2 is
`FRAME_ADMIN_HASH=<32-hex>$<64-hex>` (`${salt}$${hash}` in
`lib/frame-admin.ts`). The `$` + `<hex starting with 3>` reads as `$3`
under `set -u`. Old v0.9.5 `t_build_app` did `set -a; . /etc/dscos/frame.env`,
which aborts with exactly `/etc/dscos/frame.env: line 2: $3: unbound
variable` after the enroll step. Current HEAD (in v0.9.6+) already fixed
this via `lib/kiosk/build-env.sh::load_frame_build_env` - it reads lines
literally and only `export`s `NEXT_PUBLIC_*`. Proven on the frame:
`source lib/kiosk/build-env.sh; load_frame_build_env` → `BUILD_ENV_OK`
while direct `.` → `$3` error. `tests/kiosk-install/test-frame-build-env.sh`
passes locally. The Nov 9 05:24 failures were pre-fix v0.9.5 runs, and
`install.sh` reuses `/opt/dscos` (ignoring `KIOSK_REF` when present), so
"v0.9.6 fresh" silently re-ran v0.9.5 code.

## 2. Live remediation already verified on `oculus-02`

`apt-get install -y surf` + `systemctl enable --now dscos.service` +
`systemctl enable --now kiosk-update.timer` + `systemctl restart dscos`
→ `kiosk app health` healthy, surf running, `pkill` → respawn in ~5 s.
Reboot at 21:41 → `enabled/enabled/active`, health 200, surf running,
`display DP-1 left` @21:41:07, `browser started` @21:41:12 (no 60 s
warning). Next.js cold start is 1.3 s, so the 60 s `KIOSK_NET_WAIT` gate is
ample once the service is enabled.

## 3. Decisions

1. **Keep the write gate.** No change to frame mutations, enrollment, or
   config surfaces.
2. **Fix the update/runtime path, not the data path.** The app, frame.env
   format, and session URL are correct. The fault is that runtime updates
   don't provision what the new runtime needs.
3. **Browser reload is a CLI contract.** Operators restart the app to fix
   the picture; the CLI must then refresh the picture. Session-side
   polling is out of scope for this change.
4. **No loader change.** `build-env.sh` stays as is. This change hardens
   only the installer trap: enablement, browser package, and reload.
5. **Preserve non-frame behavior.** Hosted-console, local dev, and display
   port semantics are unchanged.

## 4. Design

### 4a. `--update-runtime` installs `surf` if missing (A)

New task `t_ensure_surf` (or extend existing apt path) runs only in the
`--update-runtime` branch, before `t_write_session`:

- If `/usr/bin/surf` exists → no-op, log `surf present`.
- Else `apt-get update` (best effort) + `apt-get install -y
  --no-install-recommends surf`. Fail loudly if the binary is still
  missing after install (non-zero exit, same as `t_verify_cmds`).
- Mirror full-install `PACKAGES` (surf only; chromium is intentionally
  left installed to save time, removal is optional follow-up).

### 4b. `--update-runtime` always enables services (B)

Stop skipping enablement on the update path in `t_write_app_service`
and `t_write_update_timer` (ignore the `KIOSK_RUNTIME_UPDATE` flag -
`lib/kiosk/cli.ts` keeps passing it so older staged installers still
work). After `daemon-reload`, unconditionally:

```bash
systemctl enable dscos.service
systemctl enable --now kiosk-update.timer
```

`enable` is idempotent, so fresh and update paths converge. Also restore
standby units: call `t_write_standby_timers` (not just `scripts`) in the
update branch. That helper re-reads `/etc/kiosk/kiosk.conf`, so it keeps
operator standby times and only rewrites the unit files. Add
`kiosk-standby-on/off.service+.timer` to `RUNTIME_FILES` in both
`install-kiosk.sh` and `lib/kiosk/updater.ts` (kept in sync per the
existing comment) so backup/restore covers them.

### 4c. `kiosk app restart` refreshes the browser (C)

In `lib/kiosk/cli.ts`:

- `cmdApp restart` → after `systemctl restart` succeeds, best-effort
  `pkill -TERM -u kiosk -x surf` (ignore exit 1 when no surf). Log
  `browser restarted to reload frame page` or `browser not running`.
- `app start` gets the same signal (stricter correctness: starting the
  app should also show it).
- `restartAndCheckHealth` (used by `update apply` / `update rollback`)
  gets the same post-health browser restart, so updates also refresh the
  picture.
- `cmdEnroll` / `cmdPassword` app restarts follow the same rule if they
  share the helper - keep one `refreshBrowserAfterApp()` helper, not
  three copies.

On non-Linux dev hosts, `pkill` may not exist or no `kiosk` user exists;
the helper is best-effort and never turns a healthy app restart into a
failure.

### 4d. What this does NOT do

- No session-side reload loop (`wait_for_network` stays 60 s-then-launch).
  Boot is fixed by enablement + 1.3 s cold start, not by waiting longer.
- No change to `FRAME_ADMIN_HASH` format, `frame.env` parsing
  (`parseFrameEnv` stays literal), or `EnvironmentFile`.
- No `install.sh` reuse-policy change beyond a docs note. `rm -rf
  /opt/dscos` remains the documented way to switch `KIOSK_REF`. An
  optional stronger guard (fail when `KIOSK_REF` ≠ installed version) is
  listed as follow-up, not required for this fix.

## 5. Components & data flow

| Component | Change |
|---|---|
| `install-kiosk.sh` `UPDATE_RUNTIME` | + `t_ensure_surf`, always-enable, + `t_write_standby_timers` |
| `install-kiosk.sh` `RUNTIME_FILES` | + 4 standby unit files (sync comment) |
| `lib/kiosk/updater.ts` `RUNTIME_FILES` | + 4 standby unit files (sync comment) |
| `lib/kiosk/cli.ts` `cmdApp restart/start` | + `refreshBrowserAfterApp()` |
| `lib/kiosk/cli.ts` `restartAndCheckHealth` | + `refreshBrowserAfterApp()` on success |
| `docs/kiosk-cli.md` | Document that `app restart` also reloads the browser |

Data flow is unchanged at boot:

```text
systemd (dscos) → Next.js :3000 ──► curl gate in session.sh ──► surf -F $KIOSK_URL
                     ▲                                          │
                     └────── app restart → pkill surf ──────────┘ (new signal)
```

## 6. Error handling

- `t_ensure_surf`: apt failure returns non-zero → task fails → update
  aborts before switching app (same as node check). Never leave a frame
  with new session but missing binary silently.
- Always-enable: `systemctl enable` on a missing unit returns non-zero.
  In update mode, log and continue only if the unit file exists; the
  write step above guarantees it does.
- Browser refresh: best-effort. A missing `pkill`, missing `kiosk` user
  (dev host), or no surf running must never fail `app restart`.
- Fresh install: `load_frame_build_env` already returns 1 on missing
  file; `$3`-hash fixtures must load silently and must NOT export
  private keys (existing test asserts `FRAME_MODE`,
  `FRAME_ADMIN_HASH`, `SYNC_TOKEN` stay unset).

## 7. Tests & acceptance

- `tests/kiosk-install/test-frame-build-env.sh` stays green
  (`NEXT_PUBLIC_TEST_VALUE=literal$3=with spaces` preserved, privates unset).
- New unit test: `kiosk app restart` (success) issues `pkill -TERM -u
  kiosk -x surf`; failure of `pkill` does not fail the command.
- New installer test: `--update-runtime` task list includes surf ensure +
  standby timers (grep/dry-run assertion or shell test).
- Runtime evidence: frame `oculus-02` after deploying runtime:
  `systemctl is-enabled dscos kiosk-update.timer` → enabled,
  `which surf` → present, reboot → health 200 + surf running, `kiosk app
  restart` → health 200 + surf pid cycles.

## 8. Risks & follow-up

- `apt-get update` inside `--update-runtime` adds ~30-60 s offline risk.
  Only run when binary is missing, and fail loudly rather than silently
  shipping a black screen.
- Always-enable overrides an operator's intentional `systemctl disable`
  for maintenance. Acceptable: an intentional disable has no CLI surface,
  and a sign on a wall with a disabled app is worse. Document it.
- `install.sh` reuse trap remains user-visible. Follow-up: fail/warn when
  requested `KIOSK_REF` differs from installed `package.json` version.

## 9. Out of scope

- Session periodic reload while the app is down (needs product decision).
- Changing `FRAME_ADMIN_HASH` encoding or `frame.env` escaping.
- Removing `chromium` from existing frames.
