# Kiosk CLI Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `kiosk` CLI runnable and robust: entry point, consistent I/O, config validation on every command, and real housekeeping commands (`version`, `logs`, `reset`, `uninstall`).

**Architecture:** Add a guarded entry point to `cli.ts` that invokes `runCli` only when `KIOSK_CLI_ENTRY=1`. Wrap command handlers with a `withConfig` validation gate. Implement new commands as small functions following existing `cmd*` patterns, with mocked `execCmd` in tests.

**Tech Stack:** TypeScript, vitest, node child_process, tsx.

---

## File Structure

- Modify: `lib/kiosk/cli.ts` — entry point, `withConfig`, new commands, I/O consistency.
- Modify: `install-kiosk.sh` — wrapper exports `KIOSK_CLI_ENTRY=1`.
- Modify: `lib/kiosk/__tests__/cli.test.ts` — new tests.
- Modify: `docs/kiosk-cli.md` — document new commands.

---

### Task 1: Add entry point

**Files:** Modify `lib/kiosk/cli.ts` (append).

- [ ] **Step 1: Append entry-point guard**

```ts
if (process.env.KIOSK_CLI_ENTRY === '1') {
  runCli(process.argv.slice(2))
    .then((r) => {
      if (r.stdout) process.stdout.write(r.stdout + '\n')
      if (r.stderr) process.stderr.write(r.stderr + '\n')
      process.exit(r.exitCode)
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/kiosk/cli.ts
git commit -m "feat(cli): add guarded entry point for kiosk binary"
```

### Task 2: Add `withConfig` validation gate

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Add helper after readConfig**

```ts
function withConfig(ctx: Ctx, fn: (config: any) => Promise<number> | number): Promise<number> | number {
  const config = readConfig(ctx)
  const errors = validateConfig(config)
  if (errors.length) {
    if (ctx.json) out(ctx, JSON.stringify({ configErrors: errors }, null, 2))
    else for (const e of errors) err(ctx, `${e.field}: ${e.message}`)
    return 1
  }
  return fn(config)
}
```

- [ ] **Step 2: Apply to `status`, `doctor`, `app`, `device`, `standby`, `sync` branches in runCli** (wrap readConfig calls). Leave `config`, `help`, `version`, `enroll`, `password`, `install` unwrapped.

- [ ] **Step 3: Commit**

```bash
git add lib/kiosk/cli.ts
git commit -m "feat(cli): validate config before running commands"
```

### Task 3: Implement `version` command

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Add cmdVersion**

```ts
async function cmdVersion(ctx: Ctx): Promise<number> {
  const fs = require('node:fs')
  let appVersion = process.env.DSCOS_VERSION || 'unknown'
  try {
    const pkg = JSON.parse(fs.readFileSync('/opt/dscos/package.json', 'utf8'))
    if (pkg.version) appVersion = pkg.version
  } catch { /* keep env/fallback */ }
  const installerVersion = '2.0'
  const osRelease = fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : ''
  const osPretty = (osRelease.match(/^PRETTY_NAME=(.*)$/m)?.[1] || '').replace(/^"|"$/g, '') || 'unknown'
  const info = { appVersion, installerVersion, os: osPretty }
  if (ctx.json) out(ctx, JSON.stringify(info, null, 2))
  else {
    out(ctx, `app:        ${appVersion}`)
    out(ctx, `installer:  ${installerVersion}`)
    out(ctx, `os:         ${osPretty}`)
  }
  return 0
}
```

- [ ] **Step 2: Wire in runCli** (`else if (cmd === 'version') code = await cmdVersion(ctx)`)

- [ ] **Step 3: Add to helpText**

- [ ] **Step 4: Commit**

### Task 4: Implement `logs` command

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Add cmdLogs**

```ts
async function cmdLogs(ctx: Ctx, args: string[]): Promise<number> {
  const idx = args.indexOf('--lines')
  const n = idx >= 0 ? String(parseInt(args[idx + 1], 10) || 100) : '100'
  const unitIdx = args.indexOf('--unit')
  const unit = unitIdx >= 0 ? args[unitIdx + 1] : APP_SERVICE
  const allowed = [APP_SERVICE, KIOSK_SERVICE]
  if (!allowed.includes(unit)) { err(ctx, `unknown unit: ${unit}`); return 2 }
  const r = execCmd('journalctl', ['-u', unit, '-n', n, '--no-pager'])
  if (r.status !== 0) { err(ctx, r.stderr || 'journalctl failed'); return r.status }
  out(ctx, r.stdout)
  return 0
}
```

- [ ] **Step 2: Wire + helpText**

- [ ] **Step 3: Commit**

### Task 5: Implement `reset` command

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Add cmdReset**

```ts
async function cmdReset(ctx: Ctx): Promise<number> {
  if (!ctx.yes) { err(ctx, 'reset requires --yes'); return 2 }
  const fs = require('node:fs')
  const p = configPath()
  try { if (fs.existsSync(p)) fs.copyFileSync(p, p + '.bak') } catch {}
  const cfg = defaultConfig()
  writeConfig(ctx, cfg)
  out(ctx, `config reset to defaults; backup at ${p}.bak`)
  return 0
}
```

- [ ] **Step 2: Wire + helpText**

- [ ] **Step 3: Commit**

### Task 6: Implement real `uninstall`

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Replace uninstall branch**

```ts
} else if (cmd === 'uninstall') {
  if (!ctx.yes) { err(ctx, 'uninstall requires --yes'); code = 2 }
  else { code = await cmdUninstall(ctx) }
}
```

- [ ] **Step 2: Add cmdUninstall**

```ts
async function cmdUninstall(ctx: Ctx): Promise<number> {
  if (process.platform !== 'linux') { err(ctx, 'uninstall only supported on Linux frames'); return 1 }
  execCmd('systemctl', ['stop', APP_SERVICE])
  execCmd('systemctl', ['disable', APP_SERVICE])
  execCmd('systemctl', ['stop', KIOSK_SERVICE])
  execCmd('systemctl', ['disable', KIOSK_SERVICE])
  const fs = require('node:fs')
  for (const f of ['/etc/systemd/system/dscos.service','/etc/systemd/system/kiosk-standby-on.service','/etc/systemd/system/kiosk-standby-on.timer','/etc/systemd/system/kiosk-standby-off.service','/etc/systemd/system/kiosk-standby-off.timer']) {
    try { fs.rmSync(f, { force: true }) } catch {}
  }
  execCmd('systemctl', ['daemon-reload'])
  try { fs.rmSync('/etc/kiosk', { recursive: true, force: true }) } catch {}
  try { fs.rmSync('/usr/local/lib/kiosk', { recursive: true, force: true }) } catch {}
  execCmd('userdel', ['-r', 'kiosk'])
  out(ctx, 'kiosk uninstalled')
  return 0
}
```

- [ ] **Step 3: Commit**

### Task 7: Update wrapper in installer

**Files:** Modify `install-kiosk.sh` `t_install_cli`.

- [ ] **Step 1: Add env export**

In the `/usr/local/bin/kiosk` heredoc, before exec, add:
```sh
export KIOSK_CLI_ENTRY=1
```

- [ ] **Step 2: Commit**

### Task 8: Tests

**Files:** Modify `lib/kiosk/__tests__/cli.test.ts`.

- [ ] **Step 1: Add tests for version, logs, reset, uninstall (mocked execCmd via vi.mock child_process).**

- [ ] **Step 2: Run tests**

Run: `npx vitest run lib/kiosk/__tests__/cli.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

### Task 9: Docs

**Files:** Modify `docs/kiosk-cli.md`.

- [ ] **Step 1: Document version, logs, reset, uninstall.**

- [ ] **Step 2: Commit**

### Task 10: Final verification

- [ ] **Step 1: Run full suite**

Run: `npm run build && npx vitest run`
Expected: build success, all tests pass.

- [ ] **Step 2: Smoke test entry point**

Run: `KIOSK_CLI_ENTRY=1 npx tsx lib/kiosk/cli.ts --help`
Expected: prints help, exit 0.

- [ ] **Step 3: Commit any fixes, push.**
