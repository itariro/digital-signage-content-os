#!/usr/bin/env bash
set -Eeuo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fail=0
ok() { echo "PASS: $*"; }
bad() { echo "FAIL: $*"; fail=1; }
SCRIPT="$REPO/install-kiosk.sh"

# UPDATE_RUNTIME: assert exact calls are in the UPDATE_RUNTIME branch (not just defined anywhere).
UPD=$(sed -n '/if (( UPDATE_RUNTIME )); then/,/^fi/p' "$SCRIPT")
printf '%s\n' "$UPD" | grep -q 't_ensure_surf' || bad "UPDATE_RUNTIME does not call t_ensure_surf"
printf '%s\n' "$UPD" | grep -q 't_write_standby_timers' || bad "UPDATE_RUNTIME branch does not call t_write_standby_timers"

# RUNTIME_FILES allowlist (install-kiosk.sh --runtime-files is the source of truth)
# The whole script must parse: --runtime-files exits before the later
# declarations, so a malformed function body further down would otherwise
# pass this test while breaking every real update.
bash -n "$SCRIPT" || bad "install-kiosk.sh has a syntax error"
for f in /etc/systemd/system/kiosk-standby-on.service /etc/systemd/system/kiosk-standby-on.timer /etc/systemd/system/kiosk-standby-off.service /etc/systemd/system/kiosk-standby-off.timer; do
  bash "$SCRIPT" --runtime-files < /dev/null 2>/dev/null | grep -qx "$f" || bad "RUNTIME_FILES missing $f"
done
bash "$SCRIPT" --runtime-files < /dev/null 2>/dev/null | grep -qx '/etc/systemd/system/dscos.service' || bad "RUNTIME_FILES missing dscos.service"

# t_ensure_surf contract: executable check, exact apt invocation, fail-loud return.
SURF_BODY=$(sed -n '/^t_ensure_surf/,/^}/p' "$SCRIPT")
printf '%s\n' "$SURF_BODY" | grep -q '\[\[ -x /usr/bin/surf \]\]' || bad "t_ensure_surf does not check executable /usr/bin/surf"
printf '%s\n' "$SURF_BODY" | grep -q 'apt-get install -y --no-install-recommends surf' || bad "t_ensure_surf does not install surf with --no-install-recommends"
printf '%s\n' "$SURF_BODY" | grep -q 'return 1' || bad "t_ensure_surf does not fail loud when binary is still missing"

# Enablement: a runtime update aborts when a unit cannot be enabled, because a
# disabled dscos or timer leaves the frame broken after the next reboot. A
# fresh install keeps warning and continuing so container/CI runs finish.
HELPER=$(sed -n '/^enable_runtime_unit()/,/^}/p' "$SCRIPT")
printf '%s\n' "$HELPER" | grep -q 'if (( UPDATE_RUNTIME )); then' || bad "enable_runtime_unit does not distinguish runtime updates"
printf '%s\n' "$HELPER" | grep -q 'return 1' || bad "enable_runtime_unit does not fail a runtime update"
for fn in t_write_app_service t_write_update_timer t_write_standby_timers; do
  body=$(sed -n "/^${fn}()/,/^}/p" "$SCRIPT")
  printf '%s\n' "$body" | grep -q 'enable_runtime_unit ' || bad "${fn} does not use enable_runtime_unit"
  if printf '%s\n' "$body" | grep -Fq 'systemctl enable'; then bad "${fn} still calls systemctl enable directly"; fi
done

# Standby disabled in kiosk.conf means the timers are written but left off.
STANDBY=$(sed -n '/^t_write_standby_timers()/,/^}/p' "$SCRIPT")
printf '%s\n' "$STANDBY" | grep -q 'KIOSK_STANDBY_ENABLED' || bad "t_write_standby_timers ignores KIOSK_STANDBY_ENABLED"
printf '%s\n' "$STANDBY" | grep -Fq 'systemctl disable --now kiosk-standby-on.timer' || bad "t_write_standby_timers does not stop disabled standby timers"

# An operator's `kiosk update disable` survives a runtime update.
TIMER=$(sed -n '/^t_write_update_timer()/,/^}/p' "$SCRIPT")
printf '%s\n' "$TIMER" | grep -Fq 'systemctl is-enabled kiosk-update.timer' || bad "t_write_update_timer does not read the previous enablement"
printf '%s\n' "$TIMER" | grep -Fq 'disabled)' || bad "t_write_update_timer does not honour a disabled timer"

(( fail == 0 )) && echo "ALL PASS"
exit "$fail"
