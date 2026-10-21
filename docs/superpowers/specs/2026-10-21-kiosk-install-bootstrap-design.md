# Kiosk install bootstrap (Homebrew-style one-liner) — design

Date: 2026-10-21
Branch: `agent/install-bootstrap-1021a`
Status: approved by owner in brainstorming dialogue

## Problem

The frame is set up by running `sudo bash install-kiosk.sh` from a checkout.
We want a single copy-paste command, the way Homebrew installs itself:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

Three things block that today:

1. `install-kiosk.sh` needs the full repo (the Next.js app) on the device. Its
   `t_deploy_app` step looks for `./package.json` in the current directory, or
   a `DSCOS_REPO` variable. A piped script has no checkout, so step 9 fails.
2. `install-kiosk.sh` assumes it lives on disk. Its `usage()` function reads
   `$0` with `sed`. That breaks when a script arrives over stdin.
3. The URL people reach for, `github.com/.../blob/main/install-kiosk.sh`,
   serves the GitHub HTML page, not the file. It must be
   `raw.githubusercontent.com`.

## Decisions

- **Thin bootstrap wrapper.** A new `install.sh` at the repo root fetches the
  source and hands off to `install-kiosk.sh`. `install-kiosk.sh` stays
  unchanged apart from a comment pointing at the new entry point.
- **Pinned ref via env.** `KIOSK_REF` selects the git ref to download.
  Default `main`. This supports tags later, for example `KIOSK_REF=v1.0`.
- **Privileges stay upfront.** The one-liner runs under `sudo`. The wrapper
  checks `EUID` and prints a clear message when not root. No mid-script
  self-escalation.
- **Tarball fetch, single code path.** Use `curl` plus `tar` only. `git` is
  not guaranteed on a fresh Debian thin client, and a tarball avoids a full
  clone on an 8 GB eMMC. If `kiosk update` later needs a checkout, it can
  convert `/opt/dscos` at that time.

## Design

### New file: `install.sh` (repo root, about 80 lines)

Steps, in order:

1. **Preflight.** Require root (`EUID == 0`, otherwise die with the exact
   sudo one-liner). Require `curl` and `tar` on PATH.
2. **Source resolution.**
   - If `/opt/dscos/package.json` exists, reuse that checkout and skip the
     download. This is the re-run path.
   - Otherwise download
     `${KIOSK_BASE_URL:-https://codeload.github.com/itariro/digital-signage-content-os}/tar.gz/${KIOSK_REF:-main}`
     into a fresh temp dir under `/tmp`, stream it through `tar -xzf`, and
     verify the unpacked tree contains both `install-kiosk.sh` and
     `package.json` before touching `/opt/dscos`. The codeload short form
     accepts a branch or tag name directly, so `KIOSK_REF=v1.0` works once
     tags exist. `KIOSK_BASE_URL` exists only so tests can point at a fixture
     tarball; production uses the default.
   - Move the verified tree into place atomically: unpack beside the target,
     then `mv`. Never leave a half-unpacked `/opt/dscos`.
3. **Handoff.** `cd /opt/dscos`, export `DSCOS_APP_DIR=/opt/dscos`, and run
   `bash install-kiosk.sh "$@"`. All arguments pass through untouched, so
   these work unchanged:

   ```bash
   curl -fsSL ... | sudo bash
   curl -fsSL ... | sudo bash -s -- --rotate right --tz Australia/Melbourne --yes
   curl -fsSL ... | sudo bash -s -- -n        # dry run, no root needed for this path? No. See below.
   ```

   Dry-run note: `install-kiosk.sh -n` needs no root, but the wrapper unpacks
   into `/opt/dscos` before handoff. The wrapper therefore keeps its root
   requirement even for `-n`. Users who want a true no-root preview can
   download and run `install-kiosk.sh` directly. Document this.
4. **Failure handling.** `set -Eeuo pipefail`, ERR trap, and an `EXIT` trap
   that removes the temp dir. On any failure, print the re-typed command and
   exit non-zero.

### Output

Small plain progress lines (download size, destination, handoff message).
No colors. `install-kiosk.sh` owns the rich UI once it starts.

### Docs

- `docs/kiosk-cli.md`: put the one-liner at the top of Installation, keep
  `sudo bash install-kiosk.sh` as the local-checkout route.
- `README.md`: replace or annotate the current install instruction with the
  one-liner.
- `install-kiosk.sh` header comment: one line pointing to `install.sh`.

## Error handling

| Failure | Behavior |
|---|---|
| Not root | die, print the sudo one-liner |
| Missing `curl`/`tar` | die with `apt-get install` hint |
| Network/HTTP error | `curl -f` exits non-zero; die, temp dir cleaned |
| Tarball missing expected files | die before touching `/opt/dscos` |
| Existing `/opt/dscos` without `package.json` | treat as corrupt target, die with an explicit remove-and-retry note (never delete silently) |
| `install-kiosk.sh` fails | its own reporting stands; wrapper exits with its code |

## Testing

- `bash -n install.sh` and ShellCheck (via `npx shellcheck` or docker) in the
  dev checkout.
- In a `debian:12` docker container:
  - one-liner against a local file:// stand-in is not possible; instead bind
    the wrapper's base URL through a `KIOSK_BASE_URL` override used only in
    tests, then run the piped install with `--yes` and confirm `/opt/dscos`
    contains the app and step 9 (deploy) passes.
  - re-run the wrapper with `/opt/dscos` present and confirm the skip-download
    path.
- `install-kiosk.sh --help` and `--dry-run` unaffected (file not rewritten
  except one comment line).

The `KIOSK_BASE_URL` override is the one extra knob beyond the approved
design; it exists so CI and local docker tests can point at a fixture
tarball. It does not change production behavior.

## Out of scope

- Self-escalation through sudo (declined).
- Making `install-kiosk.sh` itself pipe-safe (declined; wrapper covers it).
- `kiosk update` wiring.
