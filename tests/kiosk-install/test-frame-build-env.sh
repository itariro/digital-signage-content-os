#!/usr/bin/env bash
set -Eeuo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d)
cat > "$WORK/frame.env" <<'ENV'
FRAME_MODE=instance
FRAME_ADMIN_HASH=deadbeef$3$hash
SYNC_TOKEN=private-device-token
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_example
NEXT_PUBLIC_TEST_VALUE=literal$3=with spaces
ENV

run_test() (
    set -Eeuo pipefail
    unset FRAME_MODE FRAME_ADMIN_HASH SYNC_TOKEN NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY NEXT_PUBLIC_TEST_VALUE
    source "$REPO/lib/kiosk/build-env.sh" || exit 1
    load_frame_build_env "$WORK/frame.env" || exit 1

    [[ "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" == 'pk_test_example' ]] || exit 1
    [[ "$NEXT_PUBLIC_TEST_VALUE" == 'literal$3=with spaces' ]] || exit 1
    [[ -z ${FRAME_MODE+x} ]] || exit 1
    [[ -z ${FRAME_ADMIN_HASH+x} ]] || exit 1
    [[ -z ${SYNC_TOKEN+x} ]] || exit 1
    printf 'frame build environment test passed\n'
)

if run_test; then
    result=0
else
    result=$?
fi
rm -rf "$WORK"
exit "$result"
