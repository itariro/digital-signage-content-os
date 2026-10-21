#!/usr/bin/env bash
#
# install.sh - Homebrew-style bootstrap for Digital Signage Content OS frames.
#
# Downloads the application source into /opt/dscos and hands off to
# install-kiosk.sh, which turns a Debian 12/13 machine into a digital frame.
# install-kiosk.sh needs the whole repository on the device; this script
# provides it without a manual git clone.
#
# Usage (on the frame):
#   curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash -s -- --rotate right --tz Australia/Melbourne --yes
#
# Environment:
#   KIOSK_REF       branch or tag to install (default: main)
#   KIOSK_APP_DIR   where the source is placed (default: /opt/dscos)
#   KIOSK_BASE_URL  tarball base URL (tests only; production uses codeload)
#
set -Eeuo pipefail

readonly BOOTSTRAP_URL='https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh'
readonly BASE_URL="${KIOSK_BASE_URL:-https://codeload.github.com/itariro/digital-signage-content-os}"
readonly REF="${KIOSK_REF:-main}"
readonly APP_DIR="${KIOSK_APP_DIR:-/opt/dscos}"

die() { printf 'install: %s\n' "$*" >&2; exit 1; }
trap 'printf "install: failed - re-run: curl -fsSL %s | sudo bash\n" "$BOOTSTRAP_URL" >&2' ERR

TMP_DIR=""
cleanup() { [[ -n "$TMP_DIR" ]] && rm -rf "$TMP_DIR"; return 0; }
trap cleanup EXIT

# --- preflight ---
[[ $EUID -eq 0 ]] || die "must run as root: curl -fsSL $BOOTSTRAP_URL | sudo bash"
for cmd in curl tar; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required (apt-get install -y $cmd)"
done

# --- source resolution ---
if [[ -f "$APP_DIR/package.json" ]]; then
    printf 'install: reusing existing source in %s\n' "$APP_DIR"
else
    if [[ -e "$APP_DIR" ]]; then
        die "$APP_DIR exists but has no package.json; remove it and re-run: $BOOTSTRAP_URL"
    fi

    mkdir -p "$(dirname "$APP_DIR")"
    TMP_DIR=$(mktemp -d "$(dirname "$APP_DIR")/.dscos-stage.XXXXXX")
    printf 'install: downloading %s/tar.gz/%s\n' "$BASE_URL" "$REF"
    curl -fsSL --max-time 180 -o "$TMP_DIR/source.tar.gz" "$BASE_URL/tar.gz/$REF" \
        || die "download failed: $BASE_URL/tar.gz/$REF"
    mkdir "$TMP_DIR/extracted"
    tar -xzf "$TMP_DIR/source.tar.gz" -C "$TMP_DIR/extracted" \
        || die "could not unpack the download (is the ref valid?)"

    # codeload wraps the tree in one top-level directory (<repo>-<ref>).
    mapfile -t tops < <(find "$TMP_DIR/extracted" -mindepth 1 -maxdepth 1)
    [[ ${#tops[@]} -eq 1 && -d "${tops[0]}" ]] || die "unexpected tarball layout"
    tree="${tops[0]}"
    [[ -f "$tree/install-kiosk.sh" && -f "$tree/package.json" ]] \
        || die "downloaded tree is missing install-kiosk.sh or package.json (wrong ref?)"

    mv "$tree" "$APP_DIR"
    rm -rf "$TMP_DIR"; TMP_DIR=""
    printf 'install: source placed in %s\n' "$APP_DIR"
fi

# --- handoff ---
cd "$APP_DIR"
export DSCOS_APP_DIR="$APP_DIR"
printf 'install: starting kiosk installer (ref %s)\n' "$REF"
exec bash install-kiosk.sh "$@"
