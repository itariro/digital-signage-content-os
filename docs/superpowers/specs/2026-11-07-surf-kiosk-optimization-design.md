# Surf Kiosk Optimization — Design

Date: 2026-11-07
Status: Approved for implementation planning
Hardware: Dell Wyse 3040 (Intel Atom x5-Z8350, 2 GB LPDDR4, 8 GB eMMC)
Scope: `next.config.mjs`, `package.json`, `install-kiosk.sh`

## Problem

Full Chromium plus a standard Next.js build exhausts 2 GB RAM and wears the 8 GB eMMC through cache/log writes. The fleet needs a ruthlessly lightweight WebKit `surf` stack that stays compatible with the existing bootstrapper arguments (`--rotate`, `--mode`, `--output`, `--scale`, `--touch`, `--restart-hours`, `--console-url`, `--enroll-code`, `--tz`, etc.).

## Decisions locked with the reviewer

- Autologin stack: replace LightDM with getty. LightDM, its greeter, and the LightDM autologin config are removed.
- Next.js standalone: set `output: 'standalone'` to prune disk only. Keep `npm run start` / `next start` in `dscos.service`; do not rewire `ExecStart` to `node server.js`.
- Surf supervision: keep the existing CLI/config surface (`--scale`, `KIOSK_SCALE`, `KIOSK_EXTRA_FLAGS`, `--restart-hours` → `timeout`, `--touch`) and map it to Surf equivalents or documented no-ops.
- Cron reboot: implement the literal `0 3 * * * /sbin/reboot`. The existing `kiosk-update.timer` at 03:00:00 is noted as a race (see Risks), not silently shifted.

## Architecture

```
Debian 12/13 (no DE)
 └─ getty@tty1 (agetty --autologin root)
     └─ startx / Xorg + openbox
         └─ /usr/local/lib/kiosk/session.sh
             └─ surf -F $KIOSK_URL  (timeout-supervised, respawn loop)
 └─ dscos.service (Next.js app, next start on 127.0.0.1:3000)
 └─ systemd: zram-generator (lz4, ram/2), journald (volatile, 50M),
    sysctl (vm.swappiness=10), cron (daily 03:00 reboot)
```

LightDM, `kiosk.desktop`, and Chromium policy files are gone. Openbox stays only to honour Surf fullscreen and to anchor `xrandr` rotation and `xset` standby.

## Part 1 — Next.js optimization

Files: `next.config.mjs`, `package.json`.

`next.config.mjs` becomes:

```js
process.env.NEXT_TELEMETRY_DISABLED = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal footprint: only production files needed at runtime.
  output: 'standalone',
  productionBrowserSourceMaps: false,
  compress: true,
  images: { unoptimized: true },
};

export default nextConfig;
```

Notes:

- `next.config.js` in the request does not exist in this repo; the canonical file is `next.config.mjs`. Update that file, do not create a second config.
- `productionBrowserSourceMaps: false` cuts `.next` disk use on the eMMC.
- `compress: true` is the default but is set explicitly per the request.
- Telemetry: Next 16 has no `next.config` telemetry key; the supported knob is `NEXT_TELEMETRY_DISABLED=1`. Setting it at the top of `next.config.mjs` covers both `next build` and `next start`.

`package.json` `"start"` becomes:

```json
"start": "node --max-old-space-size=512 --expose-gc node_modules/.bin/next start"
```

- `--max-old-space-size=512` caps the V8 heap at half the 2 GB frame so the kernel OOM-killer is not the first line of defence.
- `--expose-gc` allows a future `global.gc()` housekeeping call without changing the launch line.
- Trailing args still forward: `ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1` becomes `node .../next start -p 3000 -H 127.0.0.1`.
- `t_deploy_app` is unchanged (`pnpm install --frozen-lockfile` + `pnpm run build`).

Heavy runtime dependencies (audit result, not a migration):

- `lodash`, `moment`, `framer-motion`: not present in `package.json`; do not add them. Use `Array.prototype` methods, `Intl.DateTimeFormat`, and CSS transitions instead.
- `sharp ^0.35.5` is a devDependency and pulls multi-arch libvips binaries. It must never be imported by the on-frame request path. Keeping it dev-only is the correct posture today.
- `better-sqlite3`, `drizzle-orm`, `@clerk/nextjs`, `swr`, `zod` are retained; they are not flagged for Atom-CPU concerns in this design.

## Part 2 — Installer refactoring

File: `install-kiosk.sh`. All edits stay inside the existing modular task functions so the step/task progress UI, `--update-runtime` allowlist, and log plumbing keep working. Step counts stay stable where possible; removed steps are folded into adjacent explainer copy.

### 2.1 CORE DEPLOYMENT & CLEANUP

- `PACKAGES` array: remove `chromium`, add `surf` and `cron`. Remove `lightdm` and `lightdm-gtk-greeter` (net win on an 8 GB eMMC; getty replaces them). Keep `xserver-xorg-core`, `xserver-xorg-input-libinput`, `xauth`, `x11-xserver-utils`, `x11-utils`, `openbox`, `dbus-x11`, `dbus-user-session`, `curl`, `ca-certificates`, `fonts-dejavu-core`, `fonts-noto-color-emoji`, `systemd-timesyncd`, `git`, `build-essential`, `python3`. Keep the conditional `if (( TOUCH )); then PACKAGES+=(xinput); fi`.
- `apt_run` dry-run name list: replace `chromium` with `surf` so the spinner detail stays honest.
- `t_verify_cmds`: check `surf` instead of `chromium` (list: `surf openbox xrandr xset xprop curl`).
- `t_apt_install`: after `apt_run install ...`, run stale-kernel purge inline:
  - `current=$(uname -r)`
  - `dpkg -l 'linux-image-*' | awk '/^ii/{print $2}' | grep -vx "$current" | xargs -r apt-get purge -y`
  - Preserve the running kernel even if the package name is odd; `-r` makes the empty case a no-op. Failures here do not abort the install (`|| true` is not used — the purge runs under the task's `set -e`, and `xargs -r` guarantees a zero status when there is nothing to purge).
- `t_apt_clean`: becomes `{ apt-get clean; apt-get autoremove --purge -y; }`.

### 2.2 WEBKIT LIFE-CYCLE SUPERVISION

`session.sh` targets Surf.

- Top of the generated `session.sh` (before any logic):
  ```sh
  export WEBKIT_DISABLE_COMPOSITING_MODE=1
  export WEBKIT_FORCE_SANDBOX=0
  ```
- `CHROMIUM_LOG` → `SURF_LOG="${RUNTIME_DIR}/kiosk-surf.log"`; `CACHE_DIR` stays on tmpfs (`${RUNTIME_DIR}/kiosk-surf-cache`); `PROFILE_DIR` becomes Surf's data dir with no Chromium Singleton/Preferences handling.
- `prepare_profile`: drop the `pgrep -x chromium`, SingletonLock removal, and `Preferences`/`Local State` sed fixes. New body: `mkdir -p "$CACHE_DIR"` only (existing call site and ordering unchanged).
- `launch_browser`: drop all Chromium flags (`--kiosk`, `--no-first-run`, `--disk-cache-dir`, etc.). New body launches `surf -F "$KIOSK_URL"`, wrapped in the existing `timeout -k 15 $((KIOSK_RESTART_HOURS * 3600))` when `KIOSK_RESTART_HOURS > 0`. Log file is `$SURF_LOG`.
- Supervision loop is unchanged: `while kill -0 "$BROWSER_PID"; do sleep 5; ensure_display 0; done`, then `wait`, then exponential backoff (`fails * 5`, capped at 60 s for exits under 20 s). A dying Surf therefore hooks back into the same loop and respawns — the "surf -F crash → supervisor respawn" requirement is met without a new timer.
- `KIOSK_SCALE` / `KIOSK_EXTRA_FLAGS`: kept in `t_write_conf` so existing `kiosk.conf` files and `--scale` invocations do not break. They are documented no-ops for Surf (Surf has no device-scale-factor concept); they are parsed but not forwarded. The design change note in `t_write_conf` says so in one line.
- `t_prep_dirs`: create `$HOME/.local/share/surf` (Surf cache/data) instead of `$HOME/.config/chromium`; both stay `0700`/`0755` on the kiosk user.
- `t_write_ctl`: `pkill -TERM -u kiosk -x surf`, `pgrep -u kiosk -x surf` for status, Surf log path in `logs`.
- `t_xsession` + `t_lightdm` are removed. Replaced by:
  - `t_getty`: write `/etc/systemd/system/getty@tty1.service.d/override.conf` (0644) containing exactly:
    ```
    [Service]
    ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM
    ```
    Create the `getty@tty1.service.d` dir, then `systemctl daemon-reload`. `ExecStart=-` means a failed start does not spam the boot log forever.
  - `t_xinit`: write `/usr/local/bin/kiosk-xinit` (0755) that starts Xorg as root on `:0` (required for `vt1` access), then drops privileges so the browser never runs as root:
    ```sh
    #!/bin/sh
    export DISPLAY=:0
    export XAUTHORITY=/home/kiosk/.Xauthority
    /usr/bin/Xorg :0 -nolisten tcp -s 0 -dpms vt1 &
    sleep 2
    exec su - kiosk -c 'exec /usr/local/lib/kiosk/session.sh'
    ```
    No `.xinitrc` or `startx` shim is needed; the getty login itself launches the X server. Root's profile hook: `/root/.profile` (or `.bash_profile`, whichever exists) gets an idempotent `if [ "$(tty)" = /dev/tty1 ]; then exec /usr/local/bin/kiosk-xinit; fi` guard.
  - `systemctl disable lightdm.service 2>/dev/null || true` in `t_getty`. `t_enable_boot` is unchanged (`set-default graphical.target` + `enable lightdm.service` guarded with `|| true` when LightDM is absent). Getty does not need `graphical.target`, but leaving the default untouched avoids boot-target churn on hosts that still install graphical units; the final session is reached via getty, not LightDM.

### 2.3 SYSTEM POLICY & RAM SECURITY

- `t_policy` and `t_policy_check`: deleted from the script and from the main task list. Step 7's explainer (`Locking down the browser`) is replaced with a Surf note (`Surf is a minimal WebKit viewer with no policy surface; lockdown is hardware-level`), and the two `task` lines are removed.
- `t_journald`: writes `/etc/systemd/journald.conf.d/20-kiosk-storage.conf` (0644) with:
  ```
  [Journal]
  Storage=volatile
  SystemMaxUse=50M
  RuntimeMaxUse=50M
  ```
  `SystemMaxUse=50M` satisfies the literal request. `RuntimeMaxUse=50M` is added because with `Storage=volatile` the cap that actually bounds RAM is `RuntimeMaxUse`; without it the "50 MB" intent is silently ignored. `systemctl restart systemd-journald` stays (non-fatal echo on failure).
- `t_zram_conf`: writes `/etc/systemd/zram-generator.conf` (0644) with:
  ```
  [zram0]
  zram-size = ram / 2
  compression-algorithm = lz4
  swap-priority = 100
  ```
  lz4 replaces zstd: on a 1.9 GHz Atom, zstd spends more CPU than it saves in swap I/O. Reload behaviour is unchanged (reboot or `systemctl restart systemd-zram-setup@zram0` picks it up).
- Sysctl (inside `t_zram_conf`, no new task so step counts stay stable): idempotent `vm.swappiness=10` in `/etc/sysctl.conf`:
  - `sed -i 's/^#\?vm\.swappiness=.*/vm.swappiness=10/' /etc/sysctl.conf` when present, else append `vm.swappiness=10`.
  - `sysctl -p` (warn-only on failure).

### 2.4 CRON REBOOT

- `t_cron_reboot` (new task, folded into the existing "Tuning the system" step count by incrementing `n_tasks` alongside the existing conditional counts):
  - Ensure `cron` is enabled: `systemctl enable cron` (service name `cron` on Debian 12/13).
  - Idempotent root crontab: ` (crontab -l 2>/dev/null | grep -vF '/sbin/reboot'; echo '0 3 * * * /sbin/reboot') | crontab -`. This adds the line only if absent and never duplicates it on re-install.

### 2.5 SUMMARY OF TASK LIST CHANGES

| Old task | New task |
|---|---|
| `t_apt_install` (Chromium) | `t_apt_install` (Surf + cron, kernel purge inline) |
| `t_verify_cmds` (chromium) | `t_verify_cmds` (surf) |
| `t_xsession`, `t_lightdm` | `t_getty`, `t_xinit` |
| `t_policy`, `t_policy_check` | (removed) |
| `t_journald` | `t_journald` (SystemMaxUse + RuntimeMaxUse) |
| `t_zram_conf` (zstd) | `t_zram_conf` (lz4 + swappiness) |
| (none) | `t_cron_reboot` |

`RUNTIME_FILES` (the `--update-runtime` allowlist) gains the getty override (`/etc/systemd/system/getty@tty1.service.d/override.conf`) and the X launcher (`/usr/local/bin/kiosk-xinit`), and loses `/usr/share/xsessions/kiosk.desktop` (the LightDM session file is gone). `--runtime-files` output stays the source of truth.

## Data flow

1. Boot → getty autologins root on tty1 → profile guard → `/usr/local/bin/kiosk-xinit` starts Xorg as root → `su - kiosk` → `session.sh` → `surf -F $KIOSK_URL`.
2. `session.sh` reads `/etc/kiosk/kiosk.conf`, waits for clock/network/display, `ensure_display` applies `xrandr --rotate`, launches `surf -F $KIOSK_URL` under `timeout`.
3. `dscos.service` (Next.js, `--max-old-space-size=512`) serves the frame URL on `127.0.0.1:3000`. No dependency between the two processes except the URL.
4. Cron reboots daily at 03:00; zram (lz4) and volatile journald prevent disk pressure between reboots.

## Error handling

- `t_apt_install` kernel purge: empty-match safe (`xargs -r`), never purges `uname -r`.
- `t_journald` / `t_sysctl` restarts are best-effort (echo a note, reboot applies them); the installer does not fail a 2 GB frame because journald is busy.
- Surf supervision: sub-20 s exits back off to 60 s; normal exits restart in 2 s. `timeout` exit 124 is treated as scheduled restart.
- `t_getty` disabling LightDM is guarded (`|| true`) so re-installs and dry-runs on non-Debian hosts do not abort.

## Testing

- `bash -n install-kiosk.sh` and `bash -n` on the generated `session.sh` (existing `t_validate`).
- `shellcheck install-kiosk.sh` if available (existing optional gate).
- `pnpm run build` to confirm `output: 'standalone'` + `productionBrowserSourceMaps: false` still green, and `.next/standalone` is produced but unused at runtime.
- `sudo bash install-kiosk.sh --dry-run --fast https://dashboard.example.com` for UI/task smoke.
- Manual on-device (Wyse 3040): cold boot reaches Surf fullscreen within `KIOSK_DISPLAY_WAIT`, `--rotate left` portrait intact, `surf` kill is respawned, `vm.swappiness` = 10, `systemctl status systemd-zram-setup@zram0`, `crontab -l` contains the reboot line, free disk on `/` after `t_apt_clean`.

## Risks

- 03:00 reboot vs `kiosk-update.timer` at 03:00:00: a reboot can interrupt an update. The design keeps the requested literal schedule and calls it out here; a follow-up may stagger cron to 03:30.
- Surf is a GUI-less WebKit viewer: no devtools, extensions, or incognito. That is the intent (lockdown is hardware-level), but `--scale` and `KIOSK_EXTRA_FLAGS` become documented no-ops.
- Removing LightDM touches `t_enable_boot` (kept, guarded) and `kiosk-ctl restart-session` (no longer restarts LightDM). Implementation updates `kiosk-ctl` to `systemctl restart getty@tty1` for session restarts; Surf keeps running as `kiosk`, not root.
- `SystemMaxUse` with `Storage=volatile` is accepted by systemd but the effective cap is `RuntimeMaxUse`; both are set so the spec is met literally and functionally.

## Out of scope

- No `node server.js` rewiring.
- No removal of `sharp` from devDependencies.
- No LightDM fallback path (replaced, not dual-booted).
- No `package.json` devDependency audit beyond the heap flag.
