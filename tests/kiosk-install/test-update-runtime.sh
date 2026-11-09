#!/usr/bin/env bash
set -Eeuo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fail=0
grep -q 't_ensure_surf' "$REPO/install-kiosk.sh" || { echo "FAIL: missing t_ensure_surf"; fail=1; }
grep -q 't_write_standby_timers' "$REPO/install-kiosk.sh" || { echo "FAIL: update branch missing t_write_standby_timers"; fail=1; }
if sed -n '/UPDATE_RUNTIME/,/^fi/p' "$REPO/install-kiosk.sh" | grep -q 't_write_standby_timers'; then :; else echo "FAIL: UPDATE_RUNTIME branch does not call t_write_standby_timers"; fail=1; fi
for f in kiosk-standby-on.service kiosk-standby-on.timer kiosk-standby-off.service kiosk-standby-off.timer; do
  grep -q "$f" "$REPO/install-kiosk.sh" || { echo "FAIL: RUNTIME_FILES missing $f"; fail=1; }
done
if grep -q 'if \[\[ ${KIOSK_RUNTIME_UPDATE:-0} != 1 \]\]; then' "$REPO/install-kiosk.sh" && grep -A2 't_write_app_service' "$REPO/install-kiosk.sh" | grep -q KIOSK_RUNTIME_UPDATE; then echo "FAIL: enable still gated on KIOSK_RUNTIME_UPDATE"; fail=1; fi
# t_ensure_surf body must install surf only when missing and fail if still missing
sed -n '/^t_ensure_surf/,/^}/p' "$REPO/install-kiosk.sh" | grep -q '/usr/bin/surf' || { echo "FAIL: t_ensure_surf does not check /usr/bin/surf"; fail=1; }
sed -n '/^t_ensure_surf/,/^}/p' "$REPO/install-kiosk.sh" | grep -q 'surf' || { echo "FAIL: t_ensure_surf does not install surf"; fail=1; }
exit "$fail"
