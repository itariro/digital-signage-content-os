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
for f in /etc/systemd/system/kiosk-standby-on.service /etc/systemd/system/kiosk-standby-on.timer /etc/systemd/system/kiosk-standby-off.service /etc/systemd/system/kiosk-standby-off.timer; do
  bash "$SCRIPT" --runtime-files < /dev/null 2>/dev/null | grep -qx "$f" || bad "RUNTIME_FILES missing $f"
done
bash "$SCRIPT" --runtime-files < /dev/null 2>/dev/null | grep -qx '/etc/systemd/system/dscos.service' || bad "RUNTIME_FILES missing dscos.service"

# t_ensure_surf contract: executable check, exact apt invocation, fail-loud return.
SURF_BODY=$(sed -n '/^t_ensure_surf/,/^}/p' "$SCRIPT")
printf '%s\n' "$SURF_BODY" | grep -q '\[\[ -x /usr/bin/surf \]\]' || bad "t_ensure_surf does not check executable /usr/bin/surf"
printf '%s\n' "$SURF_BODY" | grep -q 'apt-get install -y --no-install-recommends surf' || bad "t_ensure_surf does not install surf with --no-install-recommends"
printf '%s\n' "$SURF_BODY" | grep -q 'return 1' || bad "t_ensure_surf does not fail loud when binary is still missing"
# enable always runs with warn-and-continue (never gated on KIOSK_RUNTIME_UPDATE)
if sed -n '/^t_write_app_service/,/^}/p' "$SCRIPT" | grep -q 'KIOSK_RUNTIME_UPDATE'; then bad "t_write_app_service still gates on KIOSK_RUNTIME_UPDATE"; fi
if sed -n '/^t_write_update_timer/,/^}/p' "$SCRIPT" | grep -q 'KIOSK_RUNTIME_UPDATE'; then bad "t_write_update_timer still gates on KIOSK_RUNTIME_UPDATE"; fi
sed -n '/^t_write_app_service/,/^}/p' "$SCRIPT" | grep -q 'systemctl enable dscos.service || echo "warning: could not enable dscos.service"' || bad "t_write_app_service enable does not warn-and-continue"
sed -n '/^t_write_update_timer/,/^}/p' "$SCRIPT" | grep -q 'systemctl enable --now kiosk-update.timer || echo "warning: could not enable kiosk-update.timer"' || bad "t_write_update_timer enable does not warn-and-continue"
sed -n '/^t_write_standby_timers/,/^}/p' "$SCRIPT" | grep -q 'systemctl enable --now kiosk-standby-on.timer kiosk-standby-off.timer || echo "warning: could not enable kiosk standby timers"' || bad "t_write_standby_timers enable does not warn-and-continue"

(( fail == 0 )) && echo "ALL PASS"
exit "$fail"
