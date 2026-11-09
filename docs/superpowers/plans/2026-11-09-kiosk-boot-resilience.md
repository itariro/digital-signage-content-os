# Kiosk Boot Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chromium-born frames converge to surf + enabled services after `kiosk update apply`, and make `kiosk app restart` refresh the browser picture.

**Architecture:** Fix the runtime/update seam, not the data path — installer provisions what the new session needs, CLI signals the browser after the app is healthy. No session polling, no hash-format change.

**Tech Stack:** Bash (`install-kiosk.sh`), TypeScript CLI (`lib/kiosk/cli.ts`, `lib/kiosk/updater.ts`), Vitest, existing bash test harness in `tests/kiosk-install/`.

---

## File structure

**Modify: `install-kiosk.sh`**
- `RUNTIME_FILES` (lines 59-70) — add 4 standby unit files so backup/restore covers them. Responsibility: update allowlist.
- `t_write_app_service` (1151-1181) — drop the `KIOSK_RUNTIME_UPDATE != 1` skip; always `systemctl enable dscos.service`. Responsibility: app service unit + enablement.
- `t_write_update_timer` (1183-1208) — drop the skip; always `systemctl enable --now kiosk-update.timer`. Responsibility: update timer unit.
- New `t_ensure_surf` — apt-install `surf` when `/usr/bin/surf` is missing. Responsibility: browser binary provisioning on update.
- `UPDATE_RUNTIME` branch (1470-1487) — call `t_ensure_surf` + `t_write_standby_timers`, keep existing calls. Responsibility: runtime refresh sequence.
- Header comment (56-58) — name the new tasks so `--runtime-files` docs stay accurate.

**Modify: `lib/kiosk/updater.ts`**
- `RUNTIME_FILES` (33-43) — add the same 4 standby unit paths. Responsibility: TypeScript mirror of the installer allowlist (unioned in `applyUpdate`).

**Modify: `lib/kiosk/cli.ts`**
- `restartAndCheckHealth` (436-455) — call `refreshBrowserAfterApp()` on success. Responsibility: post-update picture refresh.
- `cmdApp` start/restart (292-307) — call `refreshBrowserAfterApp()` after successful `systemctl`. Responsibility: operator restart reloads picture.
- New `refreshBrowserAfterApp()` helper — best-effort `pkill -TERM -u kiosk -x surf`. Responsibility: single browser-refresh signal.
- `cmdEnroll` (928-931) and `cmdPassword` (967-969) — call same helper after `systemctl restart` succeeds. Responsibility: enroll/password also refresh picture.

**Modify: `docs/kiosk-cli.md`**
- `### Application service` (147-158) — one paragraph: start/restart also reloads browser. Responsibility: operator contract.

**Modify: `lib/kiosk/__tests__/cli.test.ts` + `lib/kiosk/__tests__/update-command.test.ts`**
- CLI test: `app restart` issues `pkill -TERM -u kiosk -x surf`; `pkill` failure does not fail the command.
- Update harness (80-149): add fake `pkill` shim writing to `FAKE_LOG`. Responsibility: observable, bounded test doubles.

**Do not modify:** `lib/kiosk/build-env.sh` (already correct), `lib/kiosk/frame-env.ts`, `lib/frame-admin.ts`, `session.sh`, `install.sh` (reuse trap stays docs-only per spec §4d).

---

### Task 1: Installer — standby runtime files, always-enable, surf ensure

**Files:**
- Modify: `install-kiosk.sh:56-70` (RUNTIME_FILES + header comment)
- Modify: `install-kiosk.sh:1151-1208` (always-enable)
- Modify: `install-kiosk.sh:1470-1487` (UPDATE_RUNTIME branch)
- Test: `tests/kiosk-install/test-update-runtime.sh` (new)

- [ ] **Step 1: Write the failing shell test**

```bash
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
```

Save as `tests/kiosk-install/test-update-runtime.sh`, `chmod +x`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/kiosk-install/test-update-runtime.sh`
Expected: FAIL lines for missing `t_ensure_surf` / standby files / enable gate.

- [ ] **Step 3: Add standby files to `RUNTIME_FILES`**

```bash
RUNTIME_FILES=(
    /usr/local/bin/kiosk
    "${LIB_DIR}/session.sh"
    /usr/local/bin/kiosk-ctl
    /usr/local/bin/kiosk-xinit
    /etc/systemd/system/getty@tty1.service.d/override.conf
    /etc/systemd/system/dscos.service
    /etc/systemd/system/kiosk-update.service
    /etc/systemd/system/kiosk-update.timer
    /usr/local/bin/kiosk-standby-on
    /usr/local/bin/kiosk-standby-off
    /etc/systemd/system/kiosk-standby-on.service
    /etc/systemd/system/kiosk-standby-on.timer
    /etc/systemd/system/kiosk-standby-off.service
    /etc/systemd/system/kiosk-standby-off.timer
)
```

Header comment becomes:

```bash
# Files replaced by --update-runtime. Keep in sync with t_install_cli,
# t_write_session, t_write_ctl, t_xinit, t_getty, t_write_app_service,
# t_write_update_timer, t_write_standby_scripts, t_write_standby_timers and
# t_ensure_surf.
```

- [ ] **Step 4: Add always-enable + no gate**

In `t_write_app_service`, replace:

```bash
    systemctl daemon-reload
    if [[ ${KIOSK_RUNTIME_UPDATE:-0} != 1 ]]; then
        systemctl enable dscos.service
    fi
```

with:

```bash
    systemctl daemon-reload
    systemctl enable dscos.service
```

In `t_write_update_timer`, replace:

```bash
    systemctl daemon-reload
    if [[ ${KIOSK_RUNTIME_UPDATE:-0} != 1 ]]; then
        systemctl enable --now kiosk-update.timer || true
    fi
```

with:

```bash
    systemctl daemon-reload
    systemctl enable --now kiosk-update.timer || true
```

- [ ] **Step 5: Add `t_ensure_surf` and call it in UPDATE_RUNTIME**

Insert before `t_write_app_service` (after `t_install_cli`):

```bash
# A chromium-born frame that updates to the surf runtime has no surf
# binary (full install provisions it via PACKAGES, --update-runtime does
# not). Ensure it before writing the surf-expecting session, or every
# following boot lands on the rc=127 respawn loop with a black screen.
t_ensure_surf() {
    if [[ -x /usr/bin/surf ]]; then echo "surf present"; return 0; fi
    echo "surf missing; installing"
    apt-get update || true
    apt-get install -y --no-install-recommends surf
    [[ -x /usr/bin/surf ]] || { echo "surf binary still missing after install" >&2; return 1; }
}
```

UPDATE_RUNTIME branch becomes:

```bash
    t_install_node
    t_install_cli
    t_ensure_surf
    t_write_session
    t_write_ctl
    t_getty
    t_xinit
    t_write_app_service
    t_write_update_timer
    t_write_standby_scripts
    t_write_standby_timers
    systemctl daemon-reload
```

- [ ] **Step 6: Run shell test to verify it passes**

Run: `bash tests/kiosk-install/test-update-runtime.sh`
Expected: exit 0, no FAIL lines. Also: `bash -n install-kiosk.sh && bash install-kiosk.sh --runtime-files | grep standby`

- [ ] **Step 7: Commit**

```bash
git add install-kiosk.sh tests/kiosk-install/test-update-runtime.sh
git commit -m "fix(kiosk): update-runtime ensures surf, enables services, restores standby timers"
```

---

### Task 2: Updater — mirror standby runtime files

**Files:**
- Modify: `lib/kiosk/updater.ts:30-43`
- Test: `lib/kiosk/__tests__/updater.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

```ts
import { RUNTIME_FILES } from '../updater'

it('RUNTIME_FILES covers standby units', () => {
  expect(RUNTIME_FILES).toContain('/etc/systemd/system/kiosk-standby-on.service')
  expect(RUNTIME_FILES).toContain('/etc/systemd/system/kiosk-standby-on.timer')
  expect(RUNTIME_FILES).toContain('/etc/systemd/system/kiosk-standby-off.service')
  expect(RUNTIME_FILES).toContain('/etc/systemd/system/kiosk-standby-off.timer')
})
```

Append inside the existing `describe` in `lib/kiosk/__tests__/updater.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/kiosk/__tests__/updater.test.ts`
Expected: FAIL (missing standby entries).

- [ ] **Step 3: Add the four paths**

```ts
export const RUNTIME_FILES = [
  '/usr/local/bin/kiosk',
  '/usr/local/lib/kiosk/session.sh',
  '/usr/local/bin/kiosk-ctl',
  '/usr/share/xsessions/kiosk.desktop',
  '/etc/systemd/system/dscos.service',
  '/etc/systemd/system/kiosk-update.service',
  '/etc/systemd/system/kiosk-update.timer',
  '/usr/local/bin/kiosk-standby-on',
  '/usr/local/bin/kiosk-standby-off',
  '/etc/systemd/system/kiosk-standby-on.service',
  '/etc/systemd/system/kiosk-standby-on.timer',
  '/etc/systemd/system/kiosk-standby-off.service',
  '/etc/systemd/system/kiosk-standby-off.timer',
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/kiosk/__tests__/updater.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kiosk/updater.ts lib/kiosk/__tests__/updater.test.ts
git commit -m "fix(kiosk): mirror standby units in updater runtime allowlist"
```

---

### Task 3: CLI — `refreshBrowserAfterApp()` + app start/restart wiring

**Files:**
- Modify: `lib/kiosk/cli.ts:292-307` (cmdApp) and new helper near `restartAndCheckHealth`
- Test: `lib/kiosk/__tests__/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `describe('cli')` in `lib/kiosk/__tests__/cli.test.ts`:

```ts
it('app restart reloads the browser; pkill failure does not fail the command', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-browser-'))
  const binDir = path.join(root, 'bin')
  const logPath = path.join(root, 'cmds.log')
  const origPath = process.env.PATH
  fs.mkdirSync(binDir, { recursive: true })
  const writeSh = (name: string, body: string) =>
    fs.writeFileSync(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  writeSh('systemctl', 'echo "systemctl $*" >> "$FAKE_LOG"\nexit 0')
  writeSh('pkill', 'echo "pkill $*" >> "$FAKE_LOG"\nexit 1')
  process.env.FAKE_LOG = logPath
  process.env.PATH = `${binDir}:${origPath}`
  try {
    const r = await runCli(['app', 'restart'])
    expect(r.exitCode).toBe(0)
    const log = fs.readFileSync(logPath, 'utf8')
    expect(log).toContain('systemctl restart dscos')
    expect(log).toContain('pkill -TERM -u kiosk -x surf')
    expect(r.stdout).toMatch(/browser/)
  } finally {
    process.env.PATH = origPath
    delete process.env.FAKE_LOG
    fs.rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/kiosk/__tests__/cli.test.ts`
Expected: FAIL (no pkill line).

- [ ] **Step 3: Add helper + wire cmdApp start/restart**

Insert after `restartAndCheckHealth` definition (after `checkNodeRuntime`, before `restartAndCheckHealth`):

```ts
// Best-effort browser refresh after the app is healthy. The session only
// relaunches surf when its process dies, so a surf that loaded while the
// app was down never reloads unless we kill it. Never fail the caller
// when pkill/surf/the kiosk user is absent (dev hosts, tests).
function refreshBrowserAfterApp(ctx?: Ctx): void {
  const r = execCmd('pkill', ['-TERM', '-u', 'kiosk', '-x', 'surf'])
  if (ctx) {
    out(ctx, r.status === 0 ? 'browser restarted to reload frame page' : 'browser not running; session will start it')
  }
}
```

Change `cmdApp` `start` to:

```ts
  if (sub === 'start') {
    const r = execCmd('systemctl', ['start', APP_SERVICE])
    if (r.status !== 0) { out(ctx, r.stdout || `started ${APP_SERVICE}`); return r.status }
    refreshBrowserAfterApp(ctx)
    out(ctx, r.stdout || `started ${APP_SERVICE}`)
    return 0
  }
```

Change `cmdApp` `restart` to:

```ts
  if (sub === 'restart') {
    const r = execCmd('systemctl', ['restart', APP_SERVICE])
    if (r.status !== 0) { out(ctx, r.stdout || `restarted ${APP_SERVICE}`); return r.status }
    refreshBrowserAfterApp(ctx)
    out(ctx, r.stdout || `restarted ${APP_SERVICE}`)
    return 0
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/kiosk/__tests__/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/kiosk/cli.ts lib/kiosk/__tests__/cli.test.ts
git commit -m "fix(kiosk): app start/restart reloads surf browser"
```

---

### Task 4: CLI — propagate refresh to update health path, enroll, password

**Files:**
- Modify: `lib/kiosk/cli.ts:436-455` (`restartAndCheckHealth`), `919-933` (`cmdEnroll`), `935-971` (`cmdPassword`)
- Test: `lib/kiosk/__tests__/update-command.test.ts`

- [ ] **Step 1: Write the failing test**

In `update-command.test.ts` harness (lines 105-118), add after `systemctl` shim:

```sh
writeExecutable(path.join(binDir, 'pkill'), `
echo "pkill $*" >> "$FAKE_LOG"
exit 0
`)
```

Then add:

```ts
it('refreshes the browser after a successful update health check', async () => {
  h = setupHarness()
  mockRelease(h)
  const result = await runCli(['update', 'apply', '--yes'])
  expect(result.exitCode).toBe(0)
  expect(fs.readFileSync(h.logPath, 'utf8')).toContain('pkill -TERM -u kiosk -x surf')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/kiosk/__tests__/update-command.test.ts -t "refreshes the browser"`
Expected: FAIL (no pkill line).

- [ ] **Step 3: Wire the three call sites**

In `restartAndCheckHealth`, before `return { ok: true }` on health success:

```ts
    if (code >= 200 && code < 300) { refreshBrowserAfterApp(); return { ok: true } }
```

In `cmdEnroll`, after `if (restart.status !== 0)` block:

```ts
    refreshBrowserAfterApp(ctx)
```

In `cmdPassword`, inside `if (process.platform === 'linux' && !process.env.VITEST)`, after `execCmd('systemctl', ['restart', APP_SERVICE])`:

```ts
    refreshBrowserAfterApp(ctx)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/kiosk/__tests__/update-command.test.ts lib/kiosk/__tests__/cli.test.ts`
Expected: PASS, and existing 24 update-command tests still pass (pkill shim absorbs the new call).

- [ ] **Step 5: Commit**

```bash
git add lib/kiosk/cli.ts lib/kiosk/__tests__/update-command.test.ts
git commit -m "fix(kiosk): update/enroll/password restarts reload browser"
```

---

### Task 5: Docs + full repo checks

**Files:**
- Modify: `docs/kiosk-cli.md:147-158`
- Test: `tests/kiosk-install/test-frame-build-env.sh` (must stay green)

- [ ] **Step 1: Document the contract**

Insert after `app health` paragraph (line 158):

```md
`app start` and `app restart` also restart the Surf browser after the app
is running, so the frame reloads `frameUrl` instead of keeping a stale
failed page. The same reload happens after `update apply`, `enroll`, and
`password` restarts the app. `systemctl restart dscos` alone never
refreshes the picture.
```

- [ ] **Step 2: Run full checks**

Run: `pnpm test` (skipped in any sandbox where better-sqlite3 needs rebuild — record output)
Run: `bash tests/kiosk-install/test-frame-build-env.sh && bash tests/kiosk-install/test-update-runtime.sh && bash tests/kiosk-install/test-install-sh.sh`
Expected: all PASS.

- [ ] **Step 3: Run unslop over docs diff**

Run: apply `/unslop` rules to the `docs/kiosk-cli.md` hunk only (no em dashes, plain words, active voice). Re-run Step 2 after any reword.

- [ ] **Step 4: Commit**

```bash
git add docs/kiosk-cli.md
git commit -m "docs: app restart also reloads the frame browser"
```

---

### Task 6: Frame verification (evidence, not shipped code)

**Files:** none in repo (recorded in PR description).

- [ ] **Step 1: Deploy runtime to the frame**

On `oculus-02` as root: fetch new release, then `kiosk update apply --yes` (or copy `install-kiosk.sh` and run `bash install-kiosk.sh --update-runtime --yes`).

- [ ] **Step 2: Reboot and verify**

Run: `systemctl reboot`; after 30s: `ssh root@192.168.4.77 'systemctl is-enabled dscos kiosk-update.timer; systemctl is-active dscos; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health; pgrep -u kiosk -x surf'`
Expected: `enabled`, `enabled`, `active`, `200`, surf pid present; `journalctl -t kiosk -b 0` shows `browser started` without the 60s warning.

- [ ] **Step 3: Manual restart proof**

Run: `kiosk app restart && sleep 8 && pgrep -u kiosk -x surf && journalctl -t kiosk -n 5`
Expected: surf pid cycles (new pid vs before), `browser started` after restart.

- [ ] **Step 4: Capture before/after pairs**

Before = boot log while disabled/missing-surf (already in DEBUG file). After = Task 6 boot + restart logs + `kiosk app health` healthy JSON. Paste into PR body via `/before-and-after` where a screenshot is possible (frame photo), else log pairs per AGENTS.md ship beat.

---

## Self-review

**Spec coverage:**
- §4a surf ensure → Task 1 Steps 5 + test Step 1 grep. ✓
- §4b always-enable + standby timers + RUNTIME_FILES sync → Task 1 Steps 3-4 + Task 2. ✓
- §4c browser refresh (app start/restart, health path, enroll/password, best-effort) → Tasks 3-4. ✓
- §4d no session loop / no hash change / reuse docs only → Task 5 keeps `docs/kiosk-cli.md` note, no session change. ✓
- §7 tests (build-env stays green, pkill test, installer grep test, frame evidence) → Tasks 1, 3, 4, 5, 6. ✓

**Placeholder scan:** No TBD/TODO, no “appropriate error handling” — every step has exact shell/TS text and exact commands. No “similar to Task N”; Task 4 repeats the one-line helper call explicitly.

**Type consistency:** `refreshBrowserAfterApp(ctx?: Ctx)` signature is used identically in `cmdApp`, `restartAndCheckHealth`, `cmdEnroll`, `cmdPassword`. `RUNTIME_FILES` entries match between `install-kiosk.sh` (slash paths) and `lib/kiosk/updater.ts` (same literals). `execCmd('pkill', ['-TERM','-u','kiosk','-x','surf'])` match test shim and `kiosk-ctl` string.

Execution handoff is after this plan. The implementer chooses subagent-driven or inline execution; the frame Task 6 cannot be faked in a sandbox and must be run on `oculus-02` with root ssh.
