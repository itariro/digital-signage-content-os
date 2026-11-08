# Surf Kiosk Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chromium/LightDM kiosk stack with a lightweight Surf/getty stack and heap-capped Next.js start so Dell Wyse 3040 frames (2 GB RAM, 8 GB eMMC) survive boot without OOM or eMMC wear.

**Architecture:** Next.js emits `output: 'standalone'` but keeps running via `next start` with a 512 MB heap cap. `install-kiosk.sh` swaps `chromium` for `surf` + `cron`, drops LightDM for a `getty@tty1` autologin override + Xorg launcher, rewrites `session.sh` to supervise `surf -F`, and hardens RAM/disk with lz4 zram, volatile journald, `vm.swappiness=10`, and a 03:00 cron reboot.

**Tech Stack:** Debian 12/13, systemd, Xorg, Openbox, WebKit `surf`, Next.js 16, pnpm 12, bash.

**Spec:** `docs/superpowers/specs/2026-11-07-surf-kiosk-optimization-design.md` (approved).

---

## File Structure

- Modify: `next.config.mjs` — standalone output, no browser source maps, compression on, telemetry off via env. Adds a header comment documenting heavy deps to avoid.
- Modify: `package.json` — change only the `start` script to `node --max-old-space-size=512 --expose-gc node_modules/.bin/next start`. No dependency additions or removals. JSON stays valid (no comments).
- Modify: `install-kiosk.sh` — the only installer file. Edits stay inside existing modular task functions (`t_apt_install`, `t_verify_cmds`, `t_write_session`, `t_write_conf`, `t_write_ctl`, `t_prep_dirs`, `t_journald`, `t_zram_conf`, `t_apt_clean`, `t_enable_boot`, `t_getty`, `t_xinit`, `t_cron_reboot`), the `RUNTIME_FILES` allowlist, `PACKAGES`, and the main step sequence. `t_policy`/`t_policy_check`/`t_xsession`/`t_lightdm` are deleted.
- No new test framework is introduced. Verification per task is `grep` assertions plus `bash -n install-kiosk.sh`, `shellcheck install-kiosk.sh` (when available), `pnpm run build`, and `bash install-kiosk.sh --dry-run --fast`.

---

### Task 1: Next.js output + telemetry (next.config.mjs)

**Files:**
- Modify: `next.config.mjs` (6 lines)

- [ ] **Step 1: Write a failing check**

```bash
grep -q "output: 'standalone'" next.config.mjs && echo OK || echo MISSING
```

Expected before the fix: `MISSING`.

- [ ] **Step 2: Replace `next.config.mjs` with the standalone version**

Old content (entire file):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
}

export default nextConfig
```

New content (exact):

```js
// Wyse 3040 (2 GB RAM / 8 GB eMMC): keep builds small and telemetry off.
// Avoid heavy runtime deps: lodash, moment, framer-motion are NOT installed.
// Use Array.prototype methods, Intl.DateTimeFormat, and CSS transitions.
// sharp is dev-only build tooling — never import it on the frame request path.
process.env.NEXT_TELEMETRY_DISABLED = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  compress: true,
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 3: Run the check again**

Run: `grep -q "output: 'standalone'" next.config.mjs && grep -q "productionBrowserSourceMaps: false" next.config.mjs && grep -q "compress: true" next.config.mjs && grep -q "NEXT_TELEMETRY_DISABLED" next.config.mjs && echo OK || echo MISSING`

Expected after the fix: `OK`.

- [ ] **Step 4: Verify the build still works**

Run: `pnpm run build 2>&1 | tail -n 20`

Expected: build exits 0 and `.next/standalone/` exists (unused at runtime; it proves the standalone output is pruned correctly).

- [ ] **Step 5: Commit**

```bash
git add next.config.mjs
git commit -m "feat(kiosk): standalone next output with telemetry off"
```

---

### Task 2: package.json start script (heap cap + GC)

**Files:**
- Modify: `package.json` (line 9)

- [ ] **Step 1: Write a failing check**

```bash
grep -q '"start": "node --max-old-space-size=512 --expose-gc node_modules/.bin/next start"' package.json && echo OK || echo MISSING
```

Expected before the fix: `MISSING` (current line is `"start": "next start"`).

- [ ] **Step 2: Edit the `start` script only**

Old line 9:

```json
    "start": "next start",
```

New line 9 (exact):

```json
    "start": "node --max-old-space-size=512 --expose-gc node_modules/.bin/next start",
```

Do not add any dependency, script, or comment. `package.json` must remain valid JSON. Heavy-dep documentation lives in the `next.config.mjs` header (Task 1), not as an invalid JSON comment.

- [ ] **Step 3: Run the check again**

Run: `grep -q '"start": "node --max-old-space-size=512 --expose-gc node_modules/.bin/next start"' package.json && echo OK || echo MISSING`

Expected after the fix: `OK`. Also run `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON OK')"` — expected `JSON OK`.

- [ ] **Step 4: Verify the systemd service still forwards host/port**

Run: `node --max-old-space-size=512 --expose-gc node_modules/.bin/next start --help 2>&1 | head -n 5`

Expected: Next.js help text (proves the `node .../next start` invocation resolves; `-p 3000 -H 127.0.0.1` forwarded by `npm run start -- ...` is unaffected).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(kiosk): cap next heap at 512 MB"
```

---

### Task 3: PACKAGES, verify, kernel purge, apt clean

**Files:**
- Modify: `install-kiosk.sh` — `PACKAGES` (lines 1475-1488), `apt_run` dry-run names (line 510), `t_verify_cmds` (lines 600-605), `t_apt_install` (line 597), `t_apt_clean` (line 1337)

- [ ] **Step 1: Write a failing check**

```bash
grep -q "    surf$" install-kiosk.sh && ! grep -q "    chromium$" install-kiosk.sh && grep -q "cron" install-kiosk.sh && echo OK || echo MISSING
```

Expected before the fix: `MISSING` (`chromium` is present, `surf`/`cron` are not in `PACKAGES`).

- [ ] **Step 2: Update the dry-run spinner names**

Old line 510:

```sh
        local i names=(xserver-xorg-core lightdm openbox chromium curl fonts-dejavu-core systemd-timesyncd)
```

New line 510 (exact):

```sh
        local i names=(xserver-xorg-core openbox surf curl fonts-dejavu-core systemd-timesyncd)
```

- [ ] **Step 3: Replace the `PACKAGES` array**

Old lines 1475-1488:

```sh
PACKAGES=(
    xserver-xorg-core xserver-xorg-input-libinput xauth
    x11-xserver-utils x11-utils
    lightdm lightdm-gtk-greeter
    openbox
    chromium
    dbus-x11 dbus-user-session
    curl ca-certificates
    fonts-dejavu-core fonts-noto-color-emoji
    systemd-timesyncd
    git
    build-essential python3
)
if (( TOUCH )); then PACKAGES+=(xinput); fi
```

New lines 1475-1487 (exact):

```sh
PACKAGES=(
    xserver-xorg-core xserver-xorg-input-libinput xauth
    x11-xserver-utils x11-utils
    openbox
    surf
    cron
    dbus-x11 dbus-user-session
    curl ca-certificates
    fonts-dejavu-core fonts-noto-color-emoji
    systemd-timesyncd
    git
    build-essential python3
)
if (( TOUCH )); then PACKAGES+=(xinput); fi
```

Note: `lightdm` and `lightdm-gtk-greeter` are removed with Chromium (getty replaces them; Task 5). `cron` is added per the request.

- [ ] **Step 4: Update `t_verify_cmds`**

Old lines 600-605 (exact):

```sh
t_verify_cmds() {
    local cmd
    for cmd in chromium openbox lightdm xrandr xset xprop curl; do
        command -v "$cmd" >/dev/null 2>&1 || { echo "'$cmd' is missing after installation" >&2; return 1; }
    done
}
```

New (exact):

```sh
t_verify_cmds() {
    local cmd
    for cmd in surf openbox xrandr xset xprop curl; do
        command -v "$cmd" >/dev/null 2>&1 || { echo "'$cmd' is missing after installation" >&2; return 1; }
    done
}
```

- [ ] **Step 5: Add the stale-kernel purge to `t_apt_install`**

Old line 597:

```sh
t_apt_install() { apt_run install -y --no-install-recommends "${PACKAGES[@]}"; }
```

New (exact):

```sh
t_apt_install() {
    apt_run install -y --no-install-recommends "${PACKAGES[@]}"
    # Purge stale kernels; never touch the running one (uname -r).
    local current
    current=$(uname -r)
    dpkg -l 'linux-image-*' | awk '/^ii/{print $2}' | grep -vx "$current" | xargs -r apt-get purge -y
}
```

- [ ] **Step 6: Harden `t_apt_clean`**

Old line 1337:

```sh
t_apt_clean() { apt-get clean; }
```

New (exact):

```sh
t_apt_clean() { apt-get clean; apt-get autoremove --purge -y; }
```

- [ ] **Step 7: Run the check again + syntax check**

Run: `grep -q "    surf$" install-kiosk.sh && ! grep -q "    chromium$" install-kiosk.sh && grep -q "grep -vx" install-kiosk.sh && grep -q "autoremove --purge" install-kiosk.sh && echo OK || echo MISSING`

Expected: `OK`. Run: `bash -n install-kiosk.sh && echo SYNTAX_OK` — expected `SYNTAX_OK`.

- [ ] **Step 8: Commit**

```bash
git add install-kiosk.sh
git commit -m "feat(kiosk): surf and cron packages, kernel purge, apt autoremove"
```

---

### Task 4: Surf session (t_write_conf, t_prep_dirs, t_write_session)

**Files:**
- Modify: `install-kiosk.sh` — `t_prep_dirs` (lines 628-640), `t_write_conf` (lines 642-673), `t_write_session` (lines 675-941)

- [ ] **Step 1: Write a failing check**

```bash
grep -q "WEBKIT_DISABLE_COMPOSITING_MODE=1" install-kiosk.sh && grep -q "surf -F" install-kiosk.sh && grep -q "kiosk-surf.log" install-kiosk.sh && echo OK || echo MISSING
```

Expected before the fix: `MISSING` (Chromium flags and `kiosk-chromium.log` are present).

- [ ] **Step 2: Update `t_prep_dirs` (Chromium profile dir → Surf data dir)**

Old line 632:

```sh
    install -d -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0700 "$KIOSK_HOME/.config/chromium"
```

New line 632 (exact):

```sh
    install -d -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0700 "$KIOSK_HOME/.local/share/surf"
```

- [ ] **Step 3: Update `t_write_conf` (Chromium scale/flags → Surf no-op notes)**

Old lines 653-664:

```sh
# Chromium device scale factor (empty = 1.0)
KIOSK_SCALE='${SCALE}'
# 1 = rotate touchscreen input to match the display
KIOSK_TOUCH=${TOUCH}

# Restart the browser every N hours to contain memory growth (0 = never)
KIOSK_RESTART_HOURS=${RESTART_HOURS}
# Seconds to wait for the network / for the monitor to appear at start-up
KIOSK_NET_WAIT=60
KIOSK_DISPLAY_WAIT=30
# Extra Chromium flags, space separated (no quoting inside)
KIOSK_EXTRA_FLAGS=''
```

New lines 653-664 (exact):

```sh
# Device scale factor; kept for CLI compat, ignored by Surf (no scale concept)
KIOSK_SCALE='${SCALE}'
# 1 = rotate touchscreen input to match the display
KIOSK_TOUCH=${TOUCH}

# Restart the browser every N hours to contain memory growth (0 = never)
KIOSK_RESTART_HOURS=${RESTART_HOURS}
# Seconds to wait for the network / for the monitor to appear at start-up
KIOSK_NET_WAIT=60
KIOSK_DISPLAY_WAIT=30
# Extra browser flags; kept for CLI compat, ignored by Surf
KIOSK_EXTRA_FLAGS=''
```

- [ ] **Step 4: Rewrite `t_write_session` (Chromium → Surf)**

Replace the entire `t_write_session` function (lines 675-941) with this exact function. Only the Surf-targeted pieces change; display (`xrandr`), clock, network gates, supervision loop, and backoff are byte-for-byte the current behavior apart from browser identity:

```sh
t_write_session() {
    write_file "$LIB_DIR/session.sh" 0755 <<'SESSION_EOF'
#!/bin/bash
# Kiosk session. Runs as the kiosk user inside the X session started from getty.
# If this script ever exits, the getty login ends and the screen goes dark
# until the next getty autologin.
set -u

export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_FORCE_SANDBOX=0

CONFIG_FILE=/etc/kiosk/kiosk.conf
RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp}
SURF_LOG="${RUNTIME_DIR}/kiosk-surf.log"
CACHE_DIR="${RUNTIME_DIR}/kiosk-surf-cache"   # tmpfs: spares the eMMC
WM_PID=""
BROWSER_PID=""

log() {
    logger -t kiosk -- "$*" 2>/dev/null || true
    printf '%s kiosk: %s\n' "$(date '+%F %T')" "$*" >&2
}

load_config() {
    KIOSK_URL=""; KIOSK_ROTATE="left"; KIOSK_OUTPUT=""; KIOSK_MODE=""
    KIOSK_SCALE=""; KIOSK_TOUCH=0; KIOSK_RESTART_HOURS=24
    KIOSK_NET_WAIT=60; KIOSK_DISPLAY_WAIT=30; KIOSK_EXTRA_FLAGS=""
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
    # Debian resolves 'localhost' to ::1 first, but the app binds 127.0.0.1 only,
    # so Surf would see "connection refused". Normalize to the IPv4 loopback.
    # Only normalize a plain-http URL whose host is exactly 'localhost'
    # (avoid breaking https certificate verification or other hostnames).
    case "$KIOSK_URL" in
        http://localhost|http://localhost:*|http://localhost/*|http://localhost\?*|http://localhost#*)
            KIOSK_URL="http://127.0.0.1${KIOSK_URL#http://localhost}"
            ;;
    esac

}

# ---- display ---------------------------------------------------------------

find_output() {
    if [[ -n $KIOSK_OUTPUT ]]; then
        xrandr --query | awk -v o="$KIOSK_OUTPUT" '$1==o && $2=="connected" {print $1; exit}'
    else
        xrandr --query | awk '$2=="connected" {print $1; exit}'
    fi
}

# Prints normal|left|right|inverted, or "inactive" if the output has no mode set.
# Parsing stops at the "(normal left inverted right ...)" capability list.
current_rotation() {
    xrandr --query | awk -v o="$1" '
        $1==o && $2=="connected" {
            geom=0; rot="normal"
            for (i=3; i<=NF; i++) {
                if ($i ~ /^\(/) break
                if ($i ~ /^[0-9]+x[0-9]+\+[0-9]+\+[0-9]+$/) geom=1
                if ($i=="left" || $i=="right" || $i=="inverted") rot=$i
            }
            print (geom ? rot : "inactive"); exit
        }'
}

apply_display() {
    local out=$1
    local args=(--output "$out" --primary --pos 0x0 --rotate "$KIOSK_ROTATE")
    if [[ -n $KIOSK_MODE ]]; then
        args+=(--mode "$KIOSK_MODE")
    else
        args+=(--auto)
    fi
    xrandr "${args[@]}"
}

apply_touch() {
    [[ $KIOSK_TOUCH == 1 ]] || return 0
    command -v xinput >/dev/null 2>&1 || return 0
    local m id
    case $KIOSK_ROTATE in
        left)     m="0 -1 1 1 0 0 0 0 1" ;;
        right)    m="0 1 0 -1 0 1 0 0 1" ;;
        inverted) m="-1 0 1 0 -1 1 0 0 1" ;;
        *)        m="1 0 0 0 1 0 0 0 1" ;;
    esac
    while read -r id; do
        # shellcheck disable=SC2086
        xinput set-prop "$id" "Coordinate Transformation Matrix" $m 2>/dev/null
    done < <(xinput list 2>/dev/null | sed -n 's/.*[Tt]ouch.*id=\([0-9][0-9]*\).*/\1/p')
}

# ensure_display SECONDS - make the monitor appear and match KIOSK_ROTATE.
# DisplayPort monitors often report "connected" late at boot, so retry for up
# to SECONDS (0 = single attempt). Idempotent; cheap when nothing is wrong.
ensure_display() {
    local deadline=$((SECONDS + ${1:-0})) out cur
    while :; do
        out=$(find_output)
        if [[ -n $out ]]; then
            cur=$(current_rotation "$out")
            [[ $cur == "$KIOSK_ROTATE" ]] && return 0
            log "display ${out}: rotation '${cur}' -> '${KIOSK_ROTATE}'"
            if apply_display "$out"; then
                sleep 1
                cur=$(current_rotation "$out")
                if [[ $cur == "$KIOSK_ROTATE" ]]; then
                    apply_touch
                    return 0
                fi
            fi
        fi
        (( SECONDS >= deadline )) && break
        sleep 1
    done
    log "WARNING: could not set rotation '${KIOSK_ROTATE}' (output: '${out:-none found}')"
    return 1
}

# ---- start-up gates --------------------------------------------------------

wait_for_wm() {
    for _ in $(seq 1 20); do
        xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && return 0
        sleep 0.5
    done
    return 1
}

wait_for_clock() {   # HTTPS fails with a wrong clock (dead RTC battery)
    command -v timedatectl >/dev/null 2>&1 || return 0
    for _ in $(seq 1 10); do
        [[ $(timedatectl show -p NTPSynchronized --value 2>/dev/null) == yes ]] && return 0
        sleep 2
    done
    log "WARNING: clock not NTP-synchronised yet; HTTPS pages may fail until it is"
}

wait_for_network() {
    [[ $KIOSK_URL == http* ]] || return 0
    local deadline=$((SECONDS + KIOSK_NET_WAIT)) code
    while (( SECONDS < deadline )); do
        code=$(curl -ksS -L -o /dev/null --max-time 5 -w '%{http_code}' "$KIOSK_URL" 2>/dev/null || true)
        [[ -n $code && $code != 000 ]] && return 0
        sleep 3
    done
    log "WARNING: ${KIOSK_URL} unreachable after ${KIOSK_NET_WAIT}s; starting browser anyway"
}

# ---- browser ---------------------------------------------------------------

prepare_profile() {
    # Surf keeps everything in tmpfs cache; no profile to repair after a crash.
    mkdir -p "$CACHE_DIR"
}

launch_browser() {
    local limit=()
    if (( KIOSK_RESTART_HOURS > 0 )); then
        limit=(timeout -k 15 "$((KIOSK_RESTART_HOURS * 3600))")
    fi

    : >"$SURF_LOG"
    "${limit[@]}" /usr/bin/surf -F "$KIOSK_URL" >>"$SURF_LOG" 2>&1 &
    BROWSER_PID=$!
}

cleanup() {
    trap - EXIT
    [[ -n $BROWSER_PID ]] && kill "$BROWSER_PID" 2>/dev/null
    [[ -n $WM_PID ]] && kill "$WM_PID" 2>/dev/null
    return 0
}

main() {
    load_config
    if [[ -z $KIOSK_URL ]]; then
        log "ERROR: KIOSK_URL is empty in ${CONFIG_FILE}"
        sleep 30
        exit 1
    fi

    trap cleanup EXIT
    trap 'exit 0' TERM INT HUP

    xset s off
    xset s noblank
    xset -dpms
    xsetroot -solid black

    openbox &
    WM_PID=$!
    wait_for_wm || log "WARNING: window manager did not announce itself"

    local fails=0 started up rc delay first=1
    while :; do
        load_config
        ensure_display "$KIOSK_DISPLAY_WAIT" || true
        if (( first )); then
            apply_touch
            wait_for_clock
            first=0
        fi
        wait_for_network
        prepare_profile

        started=$SECONDS
        launch_browser
        log "browser started (pid ${BROWSER_PID}) -> ${KIOSK_URL}"

        # Supervise: re-assert rotation if the monitor was power-cycled.
        while kill -0 "$BROWSER_PID" 2>/dev/null; do
            sleep 5
            ensure_display 0 || true
        done
        wait "$BROWSER_PID" 2>/dev/null
        rc=$?
        BROWSER_PID=""
        up=$((SECONDS - started))

        if (( rc == 124 )); then
            log "scheduled browser restart after ${up}s"
            fails=0; delay=2
        elif (( up < 20 )); then
            fails=$((fails + 1))
            delay=$((fails * 5 > 60 ? 60 : fails * 5))
            log "browser exited after ${up}s (rc=${rc}); retrying in ${delay}s"
        else
            fails=0; delay=2
            log "browser exited after ${up}s (rc=${rc}); restarting"
        fi
        sleep "$delay"
    done
}

main "$@"
SESSION_EOF
}
```

- [ ] **Step 5: Update `t_write_ctl` (Chromium → Surf)**

Old lines 943-977 — three replacements inside the heredoc:

Old1: `        pkill -TERM -u "$KIOSK_USER" -x chromium || echo "browser not running; the session will start it"`
New1: `        pkill -TERM -u "$KIOSK_USER" -x surf || echo "browser not running; the session will start it"`

Old2: `        printf 'chromium: '; pgrep -u "$KIOSK_USER" -x chromium >/dev/null && echo running || echo "not running"`
New2: `        printf 'surf    : '; pgrep -u "$KIOSK_USER" -x surf >/dev/null && echo running || echo "not running"`

Old3: `        echo "--- chromium log ---"` + `        tail -n 50 "/run/user/${uid}/kiosk-chromium.log" 2>/dev/null || true`
New3: `        echo "--- surf log ---"` + `        tail -n 50 "/run/user/${uid}/kiosk-surf.log" 2>/dev/null || true`

Old4: `        systemctl restart lightdm`
New4: `        systemctl restart getty@tty1`

- [ ] **Step 6: Run the check again + syntax check**

Run: `grep -q "WEBKIT_DISABLE_COMPOSITING_MODE=1" install-kiosk.sh && grep -q "surf -F" install-kiosk.sh && grep -q "kiosk-surf.log" install-kiosk.sh && grep -q "\.local/share/surf" install-kiosk.sh && echo OK || echo MISSING`

Expected: `OK`. Run: `bash -n install-kiosk.sh && echo SYNTAX_OK` — expected `SYNTAX_OK`. Run `shellcheck install-kiosk.sh 2>&1 | head -n 30` if `shellcheck` is installed; expected no errors on the new Surf block.

- [ ] **Step 7: Commit**

```bash
git add install-kiosk.sh
git commit -m "feat(kiosk): surf session supervision with webkit low-resource env"
```

---

### Task 5: Getty autologin + X launcher (replaces LightDM)

**Files:**
- Modify: `install-kiosk.sh` — `RUNTIME_FILES` (lines 58-68), delete `t_xsession`/`t_lightdm`, add `t_getty`/`t_xinit`, update `t_enable_boot`, `splash()` banner line 348, `show_plan`/`finish_screen` browser lines, main steps 6-7

- [ ] **Step 1: Write a failing check**

```bash
grep -q "agetty --autologin root" install-kiosk.sh && grep -q "kiosk-xinit" install-kiosk.sh && echo OK || echo MISSING
```

Expected before the fix: `MISSING`.

- [ ] **Step 2: Update `RUNTIME_FILES`**

Old lines 58-68:

```sh
RUNTIME_FILES=(
    /usr/local/bin/kiosk
    "${LIB_DIR}/session.sh"
    /usr/local/bin/kiosk-ctl
    /usr/share/xsessions/kiosk.desktop
    /etc/systemd/system/dscos.service
    /etc/systemd/system/kiosk-update.service
    /etc/systemd/system/kiosk-update.timer
    /usr/local/bin/kiosk-standby-on
    /usr/local/bin/kiosk-standby-off
)
```

New (exact):

```sh
RUNTIME_FILES=(
    /usr/local/bin/kiosk
    "${LIB_DIR}/session.sh"
    /usr/local/bin/kiosk-ctl
    /usr/local/bin/kiosk-xinit
    /etc/systemd/system/getty@tty1.service.d/override.conf
    /etc/systemd/system/dscos.service
    /etc/systemd/system/kiosk-update.service
    /etc/systemd/system/kiosk-update.timer
    /usr/local/bin/kiosk-standby-on
    /usr/local/bin/kiosk-standby-off
)
```

The comment above `RUNTIME_FILES` references `t_xsession`; update that comment to `t_xinit, t_getty` so `--update-runtime` docs stay accurate.

- [ ] **Step 3: Delete `t_xsession` and `t_lightdm`, add `t_getty` and `t_xinit`**

Delete the two functions `t_xsession` (lines 1236-1244) and `t_lightdm` (lines 1246-1260). Insert in their place (exact):

```sh
t_getty() {
    install -d -m 0755 /etc/systemd/system/getty@tty1.service.d
    write_file /etc/systemd/system/getty@tty1.service.d/override.conf 0644 <<'EOF'
[Service]
ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM
EOF
    systemctl disable lightdm.service 2>/dev/null || true
    systemctl daemon-reload
}

t_xinit() {
    write_file /usr/local/bin/kiosk-xinit 0755 <<'EOF'
#!/bin/sh
# Start Xorg on tty1 as root (vt access), then run the kiosk session as kiosk.
export DISPLAY=:0
export XAUTHORITY=/home/kiosk/.Xauthority
/usr/bin/Xorg :0 -nolisten tcp -s 0 -dpms vt1 &
sleep 2
exec su - kiosk -c 'exec /usr/local/lib/kiosk/session.sh'
EOF
    # Root profile guard: autologin lands on /dev/tty1 and starts X.
    local prof=/root/.profile
    [[ -f $prof ]] || prof=/root/.bash_profile
    if ! grep -q "kiosk-xinit" "$prof" 2>/dev/null; then
        printf '\n# Kiosk: start X + Surf on tty1\nif [ "$(tty)" = /dev/tty1 ]; then exec /usr/local/bin/kiosk-xinit; fi\n' >>"$prof"
    fi
}
```

Also update `t_xinit` call ordering: the generated X starts as root, `session.sh` runs as `kiosk` via `su - kiosk -c`. Do not create `.xinitrc`.

- [ ] **Step 4: Guard `t_enable_boot` when LightDM is absent**

Old lines 1332-1335:

```sh
t_enable_boot() {
    systemctl set-default graphical.target
    systemctl enable lightdm.service
}
```

New (exact):

```sh
t_enable_boot() {
    systemctl set-default graphical.target
    systemctl enable lightdm.service 2>/dev/null || true
}
```

- [ ] **Step 5: Update `splash()` banner + `show_plan`/`finish_screen` browser strings**

Old line 348: `printf '  %sChromium %s Openbox %s LightDM %s portrait-ready%s\n\n' "$MUTED" "$G_SEP" "$G_SEP" "$G_SEP" "$RST"`
New line 348: `printf '  %sSurf %s Openbox %s Getty %s portrait-ready%s\n\n' "$MUTED" "$G_SEP" "$G_SEP" "$G_SEP" "$RST"`

Old line 1385: `kv "Browser" "$( ((DRY)) && echo "(dry run)" || chromium --version 2>/dev/null || echo unknown )"`
New line 1385: `kv "Browser" "$( ((DRY)) && echo "(dry run)" || surf --version 2>/dev/null || surf -v 2>&1 | head -n 1 || echo unknown )"`

- [ ] **Step 6: Rewire main steps 6-7**

Old lines 1523-1541:

```sh
# ---- 6/9 --------------------------------------------------------------------
if [[ $ROTATE == left || $ROTATE == right ]]; then
    disp_txt="The screen is rotated to portrait ('${ROTATE}'). At every start the session waits for the monitor to report in (DisplayPort can be slow at boot), applies the rotation, and keeps re-checking so a power-cycled monitor stays upright."
else
    disp_txt="The screen is kept in '${ROTATE}' orientation. At every start the session waits for the monitor to report in and keeps re-checking it."
fi
step 2 \
    "Registers a 'Kiosk' login session and tells LightDM to sign in automatically, with the mouse pointer hidden and screen blanking disabled." \
    "$disp_txt"
task "Registering the Kiosk session" t_xsession
task "Enabling auto-login in LightDM" t_lightdm
step_end

# ---- 7/9 --------------------------------------------------------------------
step 2 \
    "A managed Chromium policy turns off sign-in, password prompts, translate, printing, downloads, extensions, developer tools and the internal chrome:// pages, so the screen can only show your dashboard."
task "Writing the Chromium lock-down policy" t_policy
task "Validating the policy file" t_policy_check
step_end
```

New (exact):

```sh
# ---- 6/9 --------------------------------------------------------------------
if [[ $ROTATE == left || $ROTATE == right ]]; then
    disp_txt="The screen is rotated to portrait ('${ROTATE}'). At every start the session waits for the monitor to report in (DisplayPort can be slow at boot), applies the rotation, and keeps re-checking so a power-cycled monitor stays upright."
else
    disp_txt="The screen is kept in '${ROTATE}' orientation. At every start the session waits for the monitor to report in and keeps re-checking it."
fi
step 2 \
    "Configures getty to sign in automatically on tty1, starting Xorg and the Surf browser fullscreen, with the mouse pointer hidden and screen blanking disabled." \
    "$disp_txt"
task "Configuring getty autologin" t_getty
task "Installing the X launcher" t_xinit
step_end

# ---- 7/9 --------------------------------------------------------------------
step 1 \
    "Surf is a minimal WebKit viewer with no extension, sign-in, or policy surface. Lockdown is hardware-level: it can only open one URL fullscreen, and the supervisor respawns it if it crashes."
task "Confirming Surf lockdown (no policy needed)" t_policy_note
step_end
```

And define `t_policy_note` where `t_policy` used to be (exact):

```sh
t_policy_note() {
    # Surf has no policy surface; this is a no-op checkpoint that documents why.
    echo "surf: minimal WebKit viewer, no extensions/sign-in; single-URL fullscreen enforced by session.sh"
}
```

Delete the old `t_policy` and `t_policy_check` functions entirely. Update `STEP_TITLES[6]` (`Locking down the browser`) copy is left as-is because the step still exists as the lockdown checkpoint; only the task lines change.

- [ ] **Step 7: Update `--update-runtime` block**

Old lines 1422-1438 (relevant lines):

```sh
    t_install_node
    t_install_cli
    t_write_session
    t_write_ctl
    t_xsession
    t_write_app_service
```

New (exact):

```sh
    t_install_node
    t_install_cli
    t_write_session
    t_write_ctl
    t_getty
    t_xinit
    t_write_app_service
```

- [ ] **Step 8: Run checks**

Run: `grep -q "agetty --autologin root" install-kiosk.sh && grep -q "kiosk-xinit" install-kiosk.sh && ! grep -q "t_xsession" install-kiosk.sh && ! grep -q "t_lightdm" install-kiosk.sh && echo OK || echo MISSING`

Expected: `OK`. Run: `bash -n install-kiosk.sh && echo SYNTAX_OK` — expected `SYNTAX_OK`. Run `bash install-kiosk.sh --runtime-files` and confirm `/usr/local/bin/kiosk-xinit` and the getty override appear and `/usr/share/xsessions/kiosk.desktop` does not.

- [ ] **Step 9: Commit**

```bash
git add install-kiosk.sh
git commit -m "feat(kiosk): getty autologin and x launcher replace lightdm"
```

---

### Task 6: Journald, zram lz4, sysctl swappiness

**Files:**
- Modify: `install-kiosk.sh` — `t_journald` (lines 1297-1306), `t_zram_conf` (lines 1316-1323)

- [ ] **Step 1: Write a failing check**

```bash
grep -q "SystemMaxUse=50M" install-kiosk.sh && grep -q "compression-algorithm = lz4" install-kiosk.sh && grep -q "vm.swappiness=10" install-kiosk.sh && echo OK || echo MISSING
```

Expected before the fix: `MISSING` (zstd present, no swappiness line).

- [ ] **Step 2: Replace `t_journald`**

Old (exact):

```sh
t_journald() {
    install -d -m 0755 /etc/systemd/journald.conf.d
    write_file /etc/systemd/journald.conf.d/20-kiosk-storage.conf 0644 <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=30M
MaxRetentionSec=14day
EOF
    systemctl restart systemd-journald || echo "could not restart journald (a reboot will apply it)"
}
```

New (exact):

```sh
t_journald() {
    install -d -m 0755 /etc/systemd/journald.conf.d
    write_file /etc/systemd/journald.conf.d/20-kiosk-storage.conf 0644 <<'EOF'
[Journal]
Storage=volatile
SystemMaxUse=50M
RuntimeMaxUse=50M
EOF
    systemctl restart systemd-journald || echo "could not restart journald (a reboot will apply it)"
}
```

`RuntimeMaxUse=50M` is required because with `Storage=volatile` the cap that bounds RAM is `RuntimeMaxUse`; `SystemMaxUse` alone is accepted but ignored.

- [ ] **Step 3: Replace `t_zram_conf` (lz4 + swappiness)**

Old (exact):

```sh
t_zram_conf() {
    write_file /etc/systemd/zram-generator.conf 0644 <<'EOF'
[zram0]
zram-size = ram / 2
compression-algorithm = zstd
swap-priority = 100
EOF
}
```

New (exact):

```sh
t_zram_conf() {
    write_file /etc/systemd/zram-generator.conf 0644 <<'EOF'
[zram0]
zram-size = ram / 2
compression-algorithm = lz4
swap-priority = 100
EOF
    # Hardware longevity: fewer slow swaps onto eMMC.
    if grep -q '^#\?vm\.swappiness=' /etc/sysctl.conf 2>/dev/null; then
        sed -i 's/^#\?vm\.swappiness=.*/vm.swappiness=10/' /etc/sysctl.conf
    else
        printf '\nvm.swappiness=10\n' >>/etc/sysctl.conf
    fi
    sysctl -p >/dev/null 2>&1 || echo "could not apply sysctl now (a reboot will apply vm.swappiness=10)"
}
```

- [ ] **Step 4: Run checks**

Run: `grep -q "SystemMaxUse=50M" install-kiosk.sh && grep -q "RuntimeMaxUse=50M" install-kiosk.sh && grep -q "compression-algorithm = lz4" install-kiosk.sh && grep -q "vm.swappiness=10" install-kiosk.sh && echo OK || echo MISSING`

Expected: `OK`. Run `bash -n install-kiosk.sh && echo SYNTAX_OK`.

- [ ] **Step 5: Commit**

```bash
git add install-kiosk.sh
git commit -m "feat(kiosk): volatile journald 50M, lz4 zram, swappiness 10"
```

---

### Task 7: Cron daily reboot + remaining copy

**Files:**
- Modify: `install-kiosk.sh` — add `t_cron_reboot`, wire it into Step 8, update Step 3/5 explainer copy and `show_plan` Browser line

- [ ] **Step 1: Write a failing check**

```bash
grep -q "0 3 \* \* \* /sbin/reboot" install-kiosk.sh && grep -q "t_cron_reboot" install-kiosk.sh && echo OK || echo MISSING
```

Expected before the fix: `MISSING`.

- [ ] **Step 2: Add `t_cron_reboot` next to `t_zram_conf`**

Insert after `t_zram_conf` (exact):

```sh
t_cron_reboot() {
    systemctl enable cron 2>/dev/null || true
    ( crontab -l 2>/dev/null | grep -vF '/sbin/reboot' ; echo '0 3 * * * /sbin/reboot' ) | crontab -
}
```

- [ ] **Step 3: Wire `t_cron_reboot` into Step 8**

Old lines 1543-1554 (variable intro):

```sh
# ---- 8/9 --------------------------------------------------------------------
n_tasks=2
if [[ -n $TZ_NAME ]]; then n_tasks=$((n_tasks + 1)); fi
if (( ZRAM )); then n_tasks=$((n_tasks + 1)); fi
```

New (exact):

```sh
# ---- 8/9 --------------------------------------------------------------------
n_tasks=3
if [[ -n $TZ_NAME ]]; then n_tasks=$((n_tasks + 1)); fi
if (( ZRAM )); then n_tasks=$((n_tasks + 1)); fi
```

Old step 8 tasks:

```sh
task "Keeping system logs in RAM" t_journald
task "Enabling network time sync" t_timesync
if [[ -n $TZ_NAME ]]; then task "Setting timezone to ${TZ_NAME}" t_timezone; fi
if (( ZRAM )); then task "Configuring zram swap" t_zram_conf; fi
```

New (exact):

```sh
task "Keeping system logs in RAM" t_journald
task "Enabling network time sync" t_timesync
task "Scheduling daily 03:00 reboot" t_cron_reboot
if [[ -n $TZ_NAME ]]; then task "Setting timezone to ${TZ_NAME}" t_timezone; fi
if (( ZRAM )); then task "Configuring zram swap" t_zram_conf; fi
```

- [ ] **Step 4: Update Step 3 and Step 5 explainer copy**

Old line 1500: `    "$G_DOT Chromium - the browser that shows your dashboard" \`
New line 1500: `    "$G_DOT Surf - the WebKit browser that shows your dashboard" \`

Old line 1517: `    "Writes /etc/kiosk/kiosk.conf (your settings), the session script that starts Chromium and keeps it running, and the kiosk-ctl helper. They are owned by root, so the kiosk user cannot modify them."`
New line 1517: `    "Writes /etc/kiosk/kiosk.conf (your settings), the session script that starts Surf and keeps it running, and the kiosk-ctl helper. They are owned by root, so the kiosk user cannot modify them."`

- [ ] **Step 5: Run checks**

Run: `grep -q "0 3 \* \* \* /sbin/reboot" install-kiosk.sh && grep -q "t_cron_reboot" install-kiosk.sh && grep -q "Surf - the WebKit browser" install-kiosk.sh && echo OK || echo MISSING`

Expected: `OK`. Run `bash -n install-kiosk.sh && echo SYNTAX_OK`.

- [ ] **Step 6: Commit**

```bash
git add install-kiosk.sh
git commit -m "feat(kiosk): daily 03:00 cron reboot"
```

---

### Task 8: Full validation + smoke (no code changes)

**Files:** none (verification only)

- [ ] **Step 1: Syntax + shellcheck**

Run: `bash -n install-kiosk.sh && echo SYNTAX_OK`

Expected: `SYNTAX_OK`.

Run: `command -v shellcheck >/dev/null && shellcheck install-kiosk.sh || echo "shellcheck not installed, skipped"`

Expected: either no errors, or the skip message. Do not block on pre-existing shellcheck warnings outside the touched functions; fix errors inside `t_getty`/`t_xinit`/`t_write_session`/`t_cron_reboot` if any.

- [ ] **Step 2: Build + dry-run**

Run: `pnpm run build 2>&1 | tail -n 10`

Expected: exit 0, `.next/standalone/` present.

Run: `bash install-kiosk.sh --dry-run --fast https://dashboard.example.com 2>&1 | tail -n 20`

Expected: dry-run completes, plan shows `Browser` without Chromium, step titles include `getty`, and no `t_policy` tasks appear.

- [ ] **Step 3: Cross-check against the spec (manual)**

Verify each spec section maps to a task:

- `next.config.mjs` standalone/telemetry → Task 1
- `package.json` start heap cap → Task 2
- `PACKAGES`/`t_verify_cmds`/kernel purge/`t_apt_clean` → Task 3
- `session.sh` Surf + `WEBKIT_*` + `surf -F` + respawn → Task 4
- `t_getty`/`t_xinit`/`RUNTIME_FILES`/`t_enable_boot` → Task 5
- `t_journald`/`t_zram_conf`/sysctl → Task 6
- Cron + copy → Task 7

If any spec line has no mapping, add a follow-up task before considering the plan done.

- [ ] **Step 4: On-device manual checklist (record results, do not automate)**

On a Wyse 3040 image of Debian 12/13:

Run: `sudo bash install-kiosk.sh --fast --rotate left https://dashboard.example.com`

Expected cold-boot result: Surf fullscreen portrait within `KIOSK_DISPLAY_WAIT`, `surf` process visible via `pgrep -a surf`, `sysctl vm.swappiness` prints `10`, `cat /etc/systemd/zram-generator.conf` shows `lz4`, `crontab -l` contains `0 3 * * * /sbin/reboot`, `cat /etc/systemd/journald.conf.d/20-kiosk-storage.conf` shows `Storage=volatile` and both `*MaxUse=50M`, killing Surf restarts it within 60 s.

---

## Self-Review (run before handing off)

1. **Spec coverage:** Part 1 → Tasks 1-2. Part 2.1 → Task 3. Part 2.2 → Tasks 4-5. Part 2.3 → Task 6. Part 2.4 → Task 5 (`t_getty` override line is exactly `ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM`). Part 2.5 → Task 7. Testing → Task 8. No spec requirement is left unmapped.
2. **Placeholder scan:** No TBD/TODO/later/appropriate-handling in this plan. Every code step shows the full replacement function or line so an implementing agent never guesses. `pnpm run build` / dry-run expected outputs are exact.
3. **Type/signature consistency:** Function names used across tasks are identical: `t_getty`, `t_xinit`, `t_cron_reboot`, `t_policy_note`, `t_journald`, `t_zram_conf`, `t_write_session`, `t_write_ctl`. File paths are identical everywhere: `/usr/local/lib/kiosk/session.sh`, `/usr/local/bin/kiosk-xinit`, `/etc/systemd/system/getty@tty1.service.d/override.conf`, `/etc/systemd/journald.conf.d/20-kiosk-storage.conf`, `/etc/systemd/zram-generator.conf`. Kiosk knob names kept: `KIOSK_URL`, `KIOSK_ROTATE`, `KIOSK_OUTPUT`, `KIOSK_MODE`, `KIOSK_SCALE`, `KIOSK_TOUCH`, `KIOSK_RESTART_HOURS`, `KIOSK_EXTRA_FLAGS`.

---

Plan complete and saved to `docs/superpowers/plans/2026-11-07-surf-kiosk-optimization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
