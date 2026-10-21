#!/usr/bin/env bash
# Test harness for install.sh (the Homebrew-style kiosk bootstrap wrapper).
# install.sh needs root, so this runs inside a Debian container:
#   docker run --rm -v "$PWD":/w:ro debian:12 bash /w/tests/kiosk-install/test-install-sh.sh
# The wrapper-under-test is read from /w/install.sh; the repo tarball is
# faked with a file:// fixture so no network is required.
set -Eeuo pipefail

REPO=/w
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0

ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

expect_rc() { # expect_rc NAME EXPECTED_ACTUAL "desc"
    if [[ $2 == "$3" ]]; then ok "$1"; else bad "$1 (expected exit $2, got $3) [$4]"; fi
}

# ---- fixture: fake repo tree, tarball served over file:// ----
# KIOSK_BASE_URL points at $FIX; the wrapper fetches $FIX/tar.gz/<ref>.
FIX="$WORK/fixture"
mkdir -p "$FIX/tar.gz" "$WORK/pkg"
printf '{"name":"dscos-fake"}\n' > "$WORK/pkg/package.json"
cat > "$WORK/pkg/install-kiosk.sh" <<'MOCK'
#!/usr/bin/env bash
echo "$*" > "$HANDOFF_FILE"
echo "mock installer ran"
MOCK
chmod +x "$WORK/pkg/install-kiosk.sh"
tar -czf "$FIX/tar.gz/main" -C "$WORK" pkg

# a tarball whose tree lacks install-kiosk.sh
mkdir -p "$WORK/noinst"
printf '{"name":"broken"}\n' > "$WORK/noinst/package.json"
tar -czf "$FIX/tar.gz/bad-tree" -C "$WORK" noinst

BASE="file://$FIX"

run_install() { # run_install APPDIR HANDOFFFILE [ref] [args...]
    local app=$1 handoff=$2 ref=${3:-main}; shift 3 || true
    KIOSK_BASE_URL="$BASE" KIOSK_APP_DIR="$app" KIOSK_REF="$ref" \
      HANDOFF_FILE="$handoff" bash "$REPO/install.sh" "$@"
}

# ---- 1: fresh download + handoff with argument passthrough ----
APP1="$WORK/app1"; H1="$WORK/h1.txt"
out=$(run_install "$APP1" "$H1" main --rotate right --yes 2>&1) && rc=0 || rc=$?
expect_rc "fresh install exits 0" 0 "$rc" "$out"
[[ -f "$APP1/package.json" && -f "$APP1/install-kiosk.sh" ]] && ok "source placed in app dir" || bad "source placed in app dir"
[[ "$(cat "$H1")" == "--rotate right --yes" ]] && ok "args passed through to installer" || bad "args passed through ($(cat "$H1"))"

# ---- 2: re-run reuses existing source (no download) ----
H2="$WORK/h2.txt"
out=$(run_install "$APP1" "$H2" main 2>&1) && rc=0 || rc=$?
expect_rc "re-run exits 0" 0 "$rc" "$out"
grep -q 'reusing existing source' <<<"$out" && ok "re-run skips download" || bad "re-run skips download ($out)"

# ---- 3: existing app dir without package.json is refused, not deleted ----
APP3="$WORK/app3"; mkdir -p "$APP3"
out=$(run_install "$APP3" "$WORK/h3.txt" main 2>&1) && rc=0 || rc=$?
[[ $rc -ne 0 ]] && ok "corrupt target refused" || bad "corrupt target refused (rc=0)"
grep -qi 'no package.json' <<<"$out" && ok "corrupt target message" || bad "corrupt target message ($out)"
[[ -d "$APP3" ]] && ok "corrupt target left untouched" || bad "corrupt target was deleted"

# ---- 4: unknown ref fails cleanly, target never created ----
APP4="$WORK/app4"
out=$(run_install "$APP4" "$WORK/h4.txt" does-not-exist 2>&1) && rc=0 || rc=$?
[[ $rc -ne 0 ]] && ok "unknown ref fails" || bad "unknown ref fails (rc=0)"
[[ ! -e "$APP4" ]] && ok "no partial target after failed download" || bad "partial target created"

# ---- 5: tarball missing install-kiosk.sh is refused before touching target ----
APP5="$WORK/app5"
out=$(run_install "$APP5" "$WORK/h5.txt" bad-tree 2>&1) && rc=0 || rc=$?
[[ $rc -ne 0 ]] && ok "bad tree refused" || bad "bad tree refused (rc=0)"
[[ ! -e "$APP5" ]] && ok "bad tree never placed" || bad "bad tree placed anyway"

# ---- 6: non-root run is refused with the sudo one-liner ----
chmod -R a+rX "$WORK"
if command -v runuser >/dev/null; then
    out=$(runuser -u nobody -- env KIOSK_BASE_URL="$BASE" KIOSK_APP_DIR="$WORK/app6" \
        bash "$REPO/install.sh" 2>&1) && rc=0 || rc=$?
    [[ $rc -ne 0 ]] && ok "non-root refused" || bad "non-root refused (rc=0)"
    grep -qi 'run as root\|sudo' <<<"$out" && ok "non-root message shows sudo usage" || bad "non-root message ($out)"
else
    printf '# skip: non-root scenarios (no runuser)\n'
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]]
