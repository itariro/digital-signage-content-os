# Kiosk CLI Robustness — Design Spec

**Date:** 2026-11-06
**Sub-project:** 1 of 3 (CLI entry point + completeness + housekeeping)
**Branch:** agent/kiosk-update-cli-1105

## Goal

Make the `kiosk` CLI actually runnable and robust: an entry point that
executes `runCli` and exits with the right code, consistent JSON/error
output, config validation on every command, and real housekeeping commands
(`version`, `logs`, `reset`, `uninstall`).

## Non-goals

- Update mechanism (sub-project 2): `update check/apply/rollback` stay
  stubs that report "not configured".
- Release automation (sub-project 3).

## Current state

- `lib/kiosk/cli.ts` exports `runCli` but never invokes it, so
  `kiosk ...` prints nothing.
- `/usr/local/bin/kiosk` wrapper runs tsx on cli.ts but sets no entry flag.
- `uninstall` only prints "uninstall requested".
- No `version`, `logs`, or `reset` commands.
- Config validation is inconsistent (some commands skip it).
- `--json` output mixes stdout/stderr.

## Design

### 1. Entry point

Add a guarded invocation at the bottom of `cli.ts`:

```ts
if (process.env.KIOSK_CLI_ENTRY === '1') {
  runCli(process.argv.slice(2)).then(r => {
    if (r.stdout) process.stdout.write(r.stdout + '\n')
    if (r.stderr) process.stderr.write(r.stderr + '\n')
    process.exit(r.exitCode)
  }).catch(e => { console.error(e?.message ?? e); process.exit(1) })
}
```

Update the `/usr/local/bin/kiosk` wrapper to export
`KIOSK_CLI_ENTRY=1` before exec'ing tsx. Tests are unaffected because the
env var is unset in the test process.

### 2. Consistent I/O

- `runCli` already collects stdout/stderr arrays. Keep single JSON object
  per command when `--json` is set; errors go to stderr only.
- Add a helper `fail(ctx, msg, code)` that pushes to stderr and sets exit.
- Every command returns a numeric exit code; `runCli` propagates it.

### 3. Config validation gate

A `withConfig(ctx, fn)` wrapper: read config, run `validateConfig`, if
errors present emit them (JSON array when `--json`) to stderr and return 1
without calling `fn`. Apply to all commands except `config`, `help`,
`version`, `enroll`, `password`, `install`.

### 4. New housekeeping commands

- `version` — print app version (from package.json, injected at build via
  `DSCOS_VERSION` env or read from `/opt/dscos/package.json`), installer
  version (`2.0`), and OS. Supports `--json`.
- `logs [--lines N] [--unit dscos|lightdm]` — tail journalctl for the unit.
- `reset [--yes]` — restore default config (backup first to
  `/etc/kiosk/kiosk.conf.bak`).
- `uninstall --yes` — stop/disable `dscos` and `lightdm`, remove units,
  `/etc/kiosk`, `/usr/local/lib/kiosk`, config; remove kiosk user/group.
  Require `--yes`; otherwise exit 2 with a message.

### 5. Robustness

- Unknown subcommand → stderr error + help to stdout, exit 2.
- Wrap execCmd failures gracefully (no unhandled throws).
- `cmdApp logs` uses journalctl with `--no-pager`.

## Files touched

- `lib/kiosk/cli.ts` (entry point, new commands, withConfig)
- `install-kiosk.sh` (`t_install_cli` wrapper update)
- `lib/kiosk/__tests__/cli.test.ts` (new tests)
- `docs/kiosk-cli.md` (document new commands)

## Testing

- Unit tests for `version`, `logs`, `reset`, `uninstall` (mocked execCmd).
- Entry-point smoke: `KIOSK_CLI_ENTRY=1 tsx cli.ts --help` exits 0 and
  prints help.
- `npm run build` + `vitest run`.

## Risks

- `uninstall` removes the kiosk user; guard with `--yes` and confirm.
- Reading package.json at runtime requires the app dir present; fall back
  to `DSCOS_VERSION` env then `'unknown'`.
- entry-point guard must not trigger during tests (env var unset).
