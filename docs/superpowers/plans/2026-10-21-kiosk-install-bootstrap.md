# Kiosk Install Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Homebrew-style `curl ... | sudo bash` one-liner (`install.sh`) that fetches the app source to `/opt/dscos` and hands off to `install-kiosk.sh`.

**Architecture:** A thin bootstrap wrapper at the repo root. It downloads the repo tarball from codeload (curl + tar only, no git dependency), verifies the tree, places it atomically, then `exec`s `install-kiosk.sh "$@"` from inside the checkout so `t_deploy_app` finds `./package.json`. `install-kiosk.sh` itself is untouched except a one-line pointer comment.

**Tech Stack:** bash (target: Debian 12/13), curl, tar. Tests run as a bash harness inside a `debian:12` Docker container (colima on this Mac). Static checks: `bash -n` and ShellCheck via `koalaman/shellcheck`.

Spec: `docs/superpowers/specs/2026-10-21-kiosk-install-bootstrap-design.md`

---

## File structure

- Create: `install.sh` (repo root) — the bootstrap wrapper. Sole responsibility: get verified source onto the device and hand off.
- Create: `tests/kiosk-install/test-install-sh.sh` — bash harness, 6 scenarios against a `file://` fixture tarball. Runs as root in a container.
- Modify: `docs/kiosk-cli.md` — Installation section leads with the one-liner.
- Modify: `README.md:508-516` — kiosk section leads with the one-liner.
- Modify: `install-kiosk.sh:8` (header comment) — one line pointing at `install.sh`.

Environment note for every docker step: the daemon runs under colima. If `docker ps` fails with a socket error, run `colima start` first (takes ~30 s).

---

### Task 1: Failing test harness

**Files:**
- Create: `tests/kiosk-install/test-install-sh.sh`

- [ ] **Step 1: Start the container daemon (once per session)**

Run: `colima start` (skip if `docker ps` already answers).
Expected: `colima` reports the VM is running.

- [ ] **Step 2: Write the harness**

Create `tests/kiosk-install/test-install-sh.sh` with exactly this content:

```bash
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
```

- [ ] **Step 3: Run the harness and verify it fails**

Run from the worktree root:

```bash
docker run --rm -v "$PWD":/w:ro debian:12 bash /w/tests/kiosk-install/test-install-sh.sh
```

Expected: FAILS immediately at scenario 1 with something like `bash: /w/install.sh: No such file or directory` and a non-zero exit. That is the red state; do not proceed until you see it.

- [ ] **Step 4: Commit**

```bash
git add tests/kiosk-install/test-install-sh.sh
git commit -m "test(kiosk): failing harness for install.sh bootstrap wrapper

Covers fresh download, re-run reuse, corrupt target refusal, unknown ref,
invalid tree, and the non-root guard."
```

---

### Task 2: Implement install.sh

**Files:**
- Create: `install.sh` (repo root)

- [ ] **Step 1: Write the wrapper**

Create `install.sh` with exactly this content:

```bash
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

    TMP_DIR=$(mktemp -d /tmp/kiosk-bootstrap.XXXXXX)
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

    mkdir -p "$(dirname "$APP_DIR")"
    mv "$tree" "$APP_DIR"
    rm -rf "$TMP_DIR"; TMP_DIR=""
    printf 'install: source placed in %s\n' "$APP_DIR"
fi

# --- handoff ---
cd "$APP_DIR"
export DSCOS_APP_DIR="$APP_DIR"
printf 'install: starting kiosk installer (ref %s)\n' "$REF"
exec bash install-kiosk.sh "$@"
```

- [ ] **Step 2: Syntax check**

Run: `bash -n install.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Run the harness and verify all scenarios pass**

Run: `docker run --rm -v "$PWD":/w:ro debian:12 bash /w/tests/kiosk-install/test-install-sh.sh`
Expected: `ok` lines for all scenarios and `6 passed, 0 failed` (or `4 passed, 0 failed` plus the skip line if `runuser` is missing), exit 0.

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat(kiosk): Homebrew-style bootstrap wrapper

install.sh downloads the repo tarball, verifies the tree, places it in
/opt/dscos, and hands off to install-kiosk.sh with all arguments passed
through. Re-runs reuse the existing source."
```

---

### Task 3: ShellCheck on both new files

**Files:**
- No new files; fixes to `install.sh` / `tests/kiosk-install/test-install-sh.sh` if warranted.

- [ ] **Step 1: Run ShellCheck in a pinned container**

Run from the worktree root:

```bash
docker run --rm -v "$PWD":/w:ro koalaman/shellcheck:stable \
  --shell=bash --exclude=SC1091 install.sh tests/kiosk-install/test-install-sh.sh
```

Expected: exit 0, no output.

- [ ] **Step 2: Address findings on the merits**

If findings appear, judge each: fix real problems in `install.sh`; for the test harness only disable a check with an inline `# shellcheck disable=SCxxxx` plus a one-line reason when the warning is a false positive for test code. Never silence errors that indicate a real bug (SC2086 word-splitting on paths, SC2155 assignment masking exit codes). Re-run the harness in Step 3 of Task 2 after any change.

- [ ] **Step 3: Commit (only if anything changed)**

```bash
git add -A install.sh tests/kiosk-install/test-install-sh.sh
git commit -m "fix(kiosk): address shellcheck findings in bootstrap wrapper"
```

---

### Task 4: Real-network smoke test

**Files:**
- No file changes; evidence capture only.

- [ ] **Step 1: Dry-run the real pipeline against the actual repository**

Run (from the worktree root; this exercises the true codeload URL, real tarball, real `install-kiosk.sh`):

```bash
docker run --rm -v "$PWD/../..":/host:ro debian:12 bash -c '
  apt-get -qq update && apt-get -qqy -o Dpkg::Use-Pty=0 install curl ca-certificates >/dev/null
  bash -c "curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | KIOSK_APP_DIR=/tmp/dscos-smoke bash -s -- -n -y" '
```

Expected: `install: downloading https://codeload.github.com/...` then the real installer's dry-run UI ending in `Dry run finished - no changes were made.` If the branch is not yet pushed, replace the curl URL with `bash /host/install.sh` style local invocation (same env) and note it in the PR as a pre-push limitation.

- [ ] **Step 2: Capture before/after evidence**

Save terminal output for the PR body:

```bash
EV=/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/kiosk-bootstrap-evidence
mkdir -p "$EV"
# before: the blob-URL one-liner people actually reach for - serves GitHub HTML
docker run --rm debian:12 bash -c '
  apt-get -qq update >/dev/null && apt-get -qqy install curl ca-certificates >/dev/null
  bash -c "curl -fsSL https://github.com/itariro/digital-signage-content-os/blob/main/install-kiosk.sh | bash" ; echo exit=$?' > "$EV/before.txt" 2>&1
# after: the new raw-URL one-liner, dry run, inside the same container shape
docker run --rm -v "$PWD":/w:ro debian:12 bash -c '
  bash /w/install.sh -n -y >/dev/null 2>&1; echo "wrapper exit=$?"
  KIOSK_APP_DIR=/tmp/dscos-smoke bash /w/install.sh -n -y | tail -n 20' > "$EV/after.txt" 2>&1
```

Expected: `before.txt` ends with bash errors on HTML (`<!DOCTYPE` ... not found) proving the naive URL fails. `after.txt` shows the wrapper placing source and the installer's dry-run finish line. (The full pre-`install.sh` failure mode - `t_deploy_app` finding no `./package.json` when the installer is piped - can be quoted from the code in the PR body; reproducing it needs a real install to step 9.)

---

### Task 5: Documentation updates

**Files:**
- Modify: `docs/kiosk-cli.md` (Installation section, lines 13-23)
- Modify: `README.md` (lines 508-516, kiosk section)
- Modify: `install-kiosk.sh:8` (header comment only)

- [ ] **Step 1: Rework `docs/kiosk-cli.md` Installation section**

Replace the section that begins `## Installation` (through the overrides code block) with:

````markdown
## Installation

One command on a fresh Debian 12/13 machine:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

`install.sh` downloads the app source into `/opt/dscos` and runs
`install-kiosk.sh`. Pass installer options after `-s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash -s -- --rotate right --tz Australia/Melbourne --yes
```

Pin a branch or tag with `KIOSK_REF=v1.0`, placed before `bash` in the
pipeline. Re-running reuses `/opt/dscos`; delete that directory (or set a
new `KIOSK_REF`) to refresh the source.

From an existing checkout, run the installer directly:

```bash
sudo bash install-kiosk.sh
```
````

- [ ] **Step 2: Update the README kiosk section**

In `README.md`, after the paragraph ending `...then deploys this application locally.` (line ~510), insert:

```markdown
Set up a frame with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

`install.sh` fetches the app source to `/opt/dscos` and runs `install-kiosk.sh`; installer options pass through `sudo bash -s --`. From a checkout you can still run `sudo bash install-kiosk.sh` directly.
```

- [ ] **Step 3: Add the pointer line to `install-kiosk.sh`**

After line 7 (`# Usage  : sudo bash install-kiosk.sh [options] https://dashboard.example.com`) insert:

```bash
#            or without a checkout:
#            curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

Run `bash -n install-kiosk.sh` to confirm the comment edit broke nothing.

- [ ] **Step 4: Commit**

```bash
git add docs/kiosk-cli.md README.md install-kiosk.sh
git commit -m "docs(kiosk): document the curl one-liner as the primary install path"
```

---

### Task 6: Repo checks and ship

**Files:** none new.

- [ ] **Step 1: Run the repo checks**

From the worktree root (worktrees don't share `node_modules`):

```bash
npm install
npm test
```

Expected: vitest suite passes. Nothing in this change touches TypeScript, so the suite must be green exactly as on `origin/main`. There is no lint script in this repo; `bash -n` and ShellCheck (Tasks 2-3) are the lint for this change.

- [ ] **Step 2: Re-run the bash harness one last time**

```bash
docker run --rm -v "$PWD":/w:ro debian:12 bash /w/tests/kiosk-install/test-install-sh.sh
```

Expected: `0 failed`.

- [ ] **Step 3: Rebase, push, open the PR**

```bash
git fetch origin
git rebase origin/main
git push -u origin agent/install-bootstrap-1021a
gh pr create --title "feat(kiosk): Homebrew-style curl one-liner install" --body-file <(generated below)
```

PR body must cover: what changed (wrapper + docs + harness), how it was tested (harness scenarios, shellcheck, container dry-run), the before/after evidence from Task 4, and risks (one-liner only works once `install.sh` is on `main`; until merge, demo the pipeline from the branch with `?ref=`-style raw URLs or the local `bash install.sh` invocation). Run the title and body through `/unslop` before posting.

- [ ] **Step 4: Run `/greploop` until 5/5 with zero unresolved comments, then present the PR URL**
