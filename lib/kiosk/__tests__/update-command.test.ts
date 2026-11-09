import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCli } from '../cli'
import { backupRuntimeFiles, markRuntimeBackupComplete, writeTimerState, RUNTIME_INCOMPLETE_MARKER } from '../updater'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

const originalPath = process.env.PATH
const originalEnv = {
  KIOSK_UPDATE_ROOT: process.env.KIOSK_UPDATE_ROOT,
  KIOSK_UPDATE_STATE: process.env.KIOSK_UPDATE_STATE,
  KIOSK_INSTALLER_VERSION_FILE: process.env.KIOSK_INSTALLER_VERSION_FILE,
  KIOSK_RUNTIME_ROOT: process.env.KIOSK_RUNTIME_ROOT,
  DSCOS_APP_DIR: process.env.DSCOS_APP_DIR,
  KIOSK_CONFIG_PATH: process.env.KIOSK_CONFIG_PATH,
  FAKE_LOG: process.env.FAKE_LOG,
  FAKE_RESTART_FAIL: process.env.FAKE_RESTART_FAIL,
  FAKE_BASH_FAIL: process.env.FAKE_BASH_FAIL,
  FAKE_NODE_VERSION: process.env.FAKE_NODE_VERSION,
  FAKE_HEALTH_FAIL: process.env.FAKE_HEALTH_FAIL,
  FAKE_HEALTH_CODE: process.env.FAKE_HEALTH_CODE,
  FAKE_HEALTH_SLOW: process.env.FAKE_HEALTH_SLOW,
  FAKE_SERVICE_STATE: process.env.FAKE_SERVICE_STATE,
}

interface Harness {
  root: string
  appDir: string
  binDir: string
  cfgPath: string
  versionFile: string
  logPath: string
  updateRoot: string
  statePath: string
  runtimeRoot: string
  tarPath: string
}

function writeExecutable(file: string, body: string): void {
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}

function makeReleaseTar(root: string, version: string, installerVersion: string): string {
  const src = path.join(root, 'release')
  fs.mkdirSync(path.join(src, 'lib', 'kiosk'), { recursive: true })
  fs.mkdirSync(path.join(src, '.next'))
  fs.mkdirSync(path.join(src, 'node_modules'))
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ version }))
  fs.writeFileSync(path.join(src, 'lib', 'kiosk', 'cli.ts'), '// new cli')
  fs.writeFileSync(
    path.join(src, 'install-kiosk.sh'),
    `#!/usr/bin/env bash\nreadonly INSTALLER_VERSION="${installerVersion}"\n`,
  )
  // Turbopack externalizes native packages as alias shims under
  // .next/node_modules. A CI-built archive ships them with absolute targets
  // from the packaging machine, which cannot resolve after install.
  fs.mkdirSync(path.join(src, '.next', 'node_modules'), { recursive: true })
  fs.symlinkSync(
    '/home/runner/work/digital-signage-content-os/digital-signage-content-os/node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3',
    path.join(src, '.next/node_modules/better-sqlite3-bfc5648742806807'),
  )
  const tarPath = path.join(root, `dscos-${version}.tar.gz`)
  execFileSync('tar', ['-czf', tarPath, '-C', src, '.'])
  return tarPath
}

function setupHarness(opts: { version?: string; installerVersion?: string } = {}): Harness {
  const version = opts.version ?? '0.9.0'
  const installerVersion = opts.installerVersion ?? '2.1'
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upcmd-'))
  const appDir = path.join(root, 'app')
  const binDir = path.join(root, 'bin')
  const cfgPath = path.join(root, 'kiosk.conf')
  const versionFile = path.join(root, 'installer.version')
  const logPath = path.join(root, 'commands.log')
  const updateRoot = path.join(root, 'updates')
  const statePath = path.join(updateRoot, 'state.json')
  const runtimeRoot = path.join(root, 'runtime')

  for (const dir of [
    path.join(appDir, 'lib', 'kiosk'),
    path.join(appDir, '.next'),
    path.join(appDir, 'node_modules'),
    path.join(runtimeRoot, 'usr', 'local', 'bin'),
    path.join(runtimeRoot, 'usr', 'bin'),
    binDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ version: '0.8.0' }))
  fs.writeFileSync(path.join(appDir, 'lib', 'kiosk', 'cli.ts'), '// old cli')
  fs.writeFileSync(cfgPath, 'KIOSK_PORT=3000\n')
  fs.writeFileSync(versionFile, '2.0\n')
  fs.writeFileSync(path.join(runtimeRoot, 'usr', 'local', 'bin', 'kiosk'), 'old runtime\n', { mode: 0o755 })
  // Managed timers are installed on a real frame; the timer-state snapshot
  // reads systemd for these units, so give the fake runtime its unit files.
  const systemdDir = path.join(runtimeRoot, 'etc', 'systemd', 'system')
  fs.mkdirSync(systemdDir, { recursive: true })
  for (const unit of ['kiosk-update.timer', 'kiosk-standby-on.timer', 'kiosk-standby-off.timer']) {
    fs.writeFileSync(path.join(systemdDir, unit), '[Timer]\nOnCalendar=daily\n')
  }
  // Stand-in for the frame's /usr/bin/node|npm. FAKE_NODE_VERSION simulates a
  // frame whose runtime predates the Node 24 floor.
  writeExecutable(path.join(runtimeRoot, 'usr', 'bin', 'node'), `
if [ "$1" = "-p" ]; then echo "\${FAKE_NODE_VERSION:-24.0.0}"; exit 0; fi
if [ "$1" = "--version" ]; then echo "v\${FAKE_NODE_VERSION:-24.0.0}"; exit 0; fi
echo "fake node $*" >&2; exit 1
`)
  writeExecutable(path.join(runtimeRoot, 'usr', 'bin', 'npm'), 'exit 0')

  writeExecutable(path.join(binDir, 'systemctl'), `
echo "systemctl $*" >> "$FAKE_LOG"
if [ "$1" = "restart" ] && [ "\${FAKE_RESTART_FAIL:-0}" = "1" ]; then
  echo "restart failed" >&2
  exit 1
fi
if [ "$1" = "is-active" ]; then
  if [ -n "\${FAKE_SERVICE_STATE:-}" ]; then echo "$FAKE_SERVICE_STATE"; [ "$FAKE_SERVICE_STATE" = "active" ] && exit 0 || exit 3; fi
  echo active; exit 0
fi
if [ "$1" = "is-enabled" ]; then echo enabled; exit 0; fi
if [ "$1" = "show" ]; then echo "Thu 2026-11-06 03:00:00 UTC"; exit 0; fi
exit 0
`)
  writeExecutable(path.join(binDir, 'pkill'), `
echo "pkill $*" >> "$FAKE_LOG"
exit 0
`)
  writeExecutable(path.join(binDir, 'curl'), `
echo "curl $*" >> "$FAKE_LOG"
if [ "\${FAKE_HEALTH_FAIL:-0}" = "1" ]; then echo "\${FAKE_HEALTH_CODE:-503}"; exit 0; fi
if [ -n "\${FAKE_HEALTH_SLOW:-}" ]; then
  count=0
  if [ -f "$FAKE_LOG.count" ]; then count=$(cat "$FAKE_LOG.count" 2>/dev/null || echo 0); fi
  count=$((count + 1))
  echo "$count" > "$FAKE_LOG.count"
  if [ "$count" -le "\${FAKE_HEALTH_SLOW}" ]; then echo "\${FAKE_HEALTH_CODE:-503}"; else echo 200; fi
  exit 0
fi
echo 200
`)
  // Keep the poll loop bounded in tests: the fake sleep never waits.
  writeExecutable(path.join(binDir, 'sleep'), 'exit 0')
  writeExecutable(path.join(binDir, 'bash'), `
echo "bash $*" >> "$FAKE_LOG"
if [ "$2" = "--runtime-files" ]; then
  printf '%s\\n' "$KIOSK_RUNTIME_ROOT/usr/local/bin/kiosk"
  exit 0
fi
if [ "$2" = "--update-runtime" ]; then
  echo "new runtime" > "$KIOSK_RUNTIME_ROOT/usr/local/bin/kiosk"
  if [ "\${FAKE_BASH_FAIL:-0}" = "1" ]; then echo "runtime boom" >&2; exit 1; fi
fi
if [ "$2" = "--build-cli" ]; then
  mkdir -p "$KIOSK_RUNTIME_ROOT/usr/local/lib/kiosk/build/kiosk"
  echo "compiled cli" > "$KIOSK_RUNTIME_ROOT/usr/local/lib/kiosk/build/kiosk/cli.js"
  if [ "\${FAKE_BASH_FAIL:-0}" = "1" ]; then echo "build boom" >&2; exit 1; fi
fi
`)

  const tarPath = makeReleaseTar(root, version, installerVersion)

  process.env.KIOSK_UPDATE_ROOT = updateRoot
  process.env.KIOSK_UPDATE_STATE = statePath
  process.env.KIOSK_INSTALLER_VERSION_FILE = versionFile
  process.env.KIOSK_RUNTIME_ROOT = runtimeRoot
  process.env.DSCOS_APP_DIR = appDir
  process.env.KIOSK_CONFIG_PATH = cfgPath
  process.env.FAKE_LOG = logPath
  process.env.PATH = `${binDir}:${originalPath}`
  delete process.env.FAKE_RESTART_FAIL
  delete process.env.FAKE_BASH_FAIL
  delete process.env.FAKE_NODE_VERSION
  delete process.env.FAKE_HEALTH_FAIL
  delete process.env.FAKE_HEALTH_CODE
  delete process.env.FAKE_HEALTH_SLOW
  delete process.env.FAKE_SERVICE_STATE

  return { root, appDir, binDir, cfgPath, versionFile, logPath, updateRoot, statePath, runtimeRoot, tarPath }
}

function mockRelease(h: Harness, version = '0.9.0'): void {
  const tar = fs.readFileSync(h.tarPath)
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const url = String(input)
    if (url.includes('/releases/tags/v') || url.includes('/releases/latest')) {
      return new Response(JSON.stringify({
        tag_name: `v${version}`,
        assets: [{
          name: `dscos-${version}.tar.gz`,
          browser_download_url: `https://example.test/dscos-${version}.tar.gz`,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes(`dscos-${version}.tar.gz`)) {
      return new Response(new Uint8Array(tar), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }))
}

function appVersion(h: Harness, dir = h.appDir): string {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
}

function runtimeKiosk(h: Harness): string {
  return path.join(h.runtimeRoot, 'usr', 'local', 'bin', 'kiosk')
}

describe('update command', () => {
  let h: Harness

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.PATH = originalPath
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    if (h?.root) fs.rmSync(h.root, { recursive: true, force: true })
  })

  it('downloads, extracts, applies, and rolls back a release', async () => {
    h = setupHarness()
    mockRelease(h)

    const apply = await runCli(['update', 'apply', '--yes'])
    expect(apply.exitCode).toBe(0)
    expect(apply.stdout).toContain('updated to 0.9.0')
    expect(appVersion(h)).toBe('0.9.0')
    expect(appVersion(h, path.join(h.updateRoot, 'backup', '0.9.0'))).toBe('0.8.0')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.1')
    expect(fs.readFileSync(h.logPath, 'utf8')).toContain('--update-runtime')
    expect(fs.readFileSync(h.logPath, 'utf8')).toContain('--build-cli')
    expect(fs.readFileSync(path.join(h.runtimeRoot, 'usr', 'local', 'lib', 'kiosk', 'build', 'kiosk', 'cli.js'), 'utf8').trim()).toBe('compiled cli')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('new runtime')
    const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'))
    expect(state.lastBackup).toBe(path.join(h.updateRoot, 'backup', '0.9.0'))
    expect(state.runtimeBackup).toBe(path.join(h.updateRoot, 'runtime-backup', '0.9.0'))
    expect(fs.existsSync(path.join(state.runtimeBackup, RUNTIME_INCOMPLETE_MARKER))).toBe(false)
    expect(fs.existsSync(path.join(state.runtimeBackup, 'timers.json'))).toBe(true)

    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(0)
    expect(rollback.stdout).toContain('rolled back')
    // The snapshot recorded the timers as enabled/active before the update, so
    // the rollback replays that state after restoring the unit files.
    expect(fs.readFileSync(h.logPath, 'utf8')).toContain('systemctl enable kiosk-update.timer')
    expect(fs.readFileSync(path.join(h.runtimeRoot, 'usr', 'local', 'lib', 'kiosk', 'build', 'kiosk', 'cli.js'), 'utf8').trim()).toBe('compiled cli')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
    expect(fs.existsSync(state.runtimeBackup)).toBe(false)
    expect(JSON.parse(fs.readFileSync(h.statePath, 'utf8')).lastBackup).toBeNull()
  })

  it('rewrites CI-absolute external shims in the staged release before switching', async () => {
    h = setupHarness()
    mockRelease(h)

    const apply = await runCli(['update', 'apply', '--yes'])
    expect(apply.exitCode).toBe(0)
    // The shipped alias pointed at /home/runner/work/...; after staging it
    // must resolve inside the installed tree instead.
    expect(
      fs.readlinkSync(path.join(h.appDir, '.next/node_modules/better-sqlite3-bfc5648742806807')),
    ).toBe('../../node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3')
  })

  it('fails fast before the app switch when Node is below 24', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_NODE_VERSION = '22.14.0'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Node >=24 required (found 22.14.0); run installer')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.existsSync(path.join(h.updateRoot, 'backup'))).toBe(false)
  })

  it('reports health failure detail with HTTP code, port, and journal hint', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_HEALTH_FAIL = '1'
    process.env.FAKE_HEALTH_CODE = '503'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('health check failed (HTTP 503 on 127.0.0.1:3000); see: journalctl -u dscos -n 30')
    expect(result.stderr).toMatch(/rolled back/)
    expect(appVersion(h)).toBe('0.8.0')
  })

  it('reports HTTP 000 when the app never listens', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_HEALTH_FAIL = '1'
    process.env.FAKE_HEALTH_CODE = '000'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('health check failed (HTTP 000 on 127.0.0.1:3000); see: journalctl -u dscos -n 30')
    expect(appVersion(h)).toBe('0.8.0')
  })

  it('waits past ten polls for a slow Next.js cold start', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_HEALTH_SLOW = '12'
    process.env.FAKE_HEALTH_CODE = '503'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('updated to 0.9.0')
    expect(appVersion(h)).toBe('0.9.0')
  })

  it('stops probing quickly when the service is not active', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_SERVICE_STATE = 'failed'
    process.env.FAKE_HEALTH_FAIL = '1'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('health check failed')
    expect(result.stderr).toContain('journalctl -u dscos -n 30')
    // Gated on is-active, the prober fails fast instead of burning ~90s.
    const log = fs.existsSync(h.logPath) ? fs.readFileSync(h.logPath, 'utf8') : ''
    expect(log.split('\n').filter((line) => line.startsWith('curl ')).length).toBeLessThan(5)
    expect(appVersion(h)).toBe('0.8.0')
  })

  it('restores the previous app and runtime when the restart fails', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_RESTART_FAIL = '1'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/rollback|rolled back/)
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
  })

  it('restores the previous runtime when the helper install fails', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_BASH_FAIL = '1'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('previous runtime restored')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
    expect(fs.existsSync(path.join(h.updateRoot, 'backup'))).toBe(false)
    expect(fs.existsSync(path.join(h.updateRoot, 'runtime-backup', '0.9.0'))).toBe(false)
  })

  it('restores the previous app and runtime when the state write fails', async () => {
    h = setupHarness()
    mockRelease(h)
    fs.mkdirSync(h.statePath, { recursive: true })

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('could not record update state')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.0')
  })

  it('restores the previous runtime when the switch cannot create its backup', async () => {
    h = setupHarness()
    mockRelease(h)
    fs.mkdirSync(path.join(h.updateRoot, 'backup'), { recursive: true })
    fs.writeFileSync(path.join(h.updateRoot, 'backup', '0.9.0'), 'not a directory')

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('switch failed')
    expect(result.stderr).toContain('previous runtime restored')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
    expect(fs.existsSync(path.join(h.appDir, '.next'))).toBe(true)
  })

  it('keeps the saved backup when recovery cannot roll the app back', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_RESTART_FAIL = '1'
    const blocker = `${h.appDir}.rollback-tmp`
    fs.mkdirSync(blocker)
    fs.writeFileSync(path.join(blocker, 'keep'), 'x')

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('rollback failed')
    expect(appVersion(h)).toBe('0.9.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('new runtime')
    const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'))
    expect(state.lastBackup).toBe(path.join(h.updateRoot, 'backup', '0.9.0'))
    expect(fs.existsSync(state.lastBackup)).toBe(true)

    delete process.env.FAKE_RESTART_FAIL
    fs.rmSync(blocker, { recursive: true, force: true })
    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(0)
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
  })

  it('restores an interrupted attempt before snapshotting a retry', async () => {
    h = setupHarness()
    mockRelease(h)
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    expect(backupRuntimeFiles([runtimeKiosk(h)], snapshot)).toEqual({ ok: true })
    fs.writeFileSync(runtimeKiosk(h), 'partly new\n')

    const apply = await runCli(['update', 'apply', '--yes'])
    expect(apply.exitCode).toBe(0)
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('new runtime')

    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(0)
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
  })

  it('does not restore a completed snapshot on a later apply', async () => {
    h = setupHarness()
    mockRelease(h)
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    expect(backupRuntimeFiles([runtimeKiosk(h)], snapshot)).toEqual({ ok: true })
    expect(markRuntimeBackupComplete(snapshot)).toEqual({ ok: true })
    fs.writeFileSync(runtimeKiosk(h), 'current runtime\n')

    const apply = await runCli(['update', 'apply', '--yes'])
    expect(apply.exitCode).toBe(0)

    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(0)
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('current runtime')
  })

  it('finishes a recovery that could not restore the runtime', async () => {
    h = setupHarness()
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    expect(backupRuntimeFiles([runtimeKiosk(h)], snapshot)).toEqual({ ok: true })
    fs.writeFileSync(runtimeKiosk(h), 'mixed runtime\n')
    fs.mkdirSync(path.dirname(h.statePath), { recursive: true })
    fs.writeFileSync(h.statePath, JSON.stringify({
      lastBackup: null,
      runtimeBackup: snapshot,
      installedVersion: '0.8.0',
    }))

    const result = await runCli(['update', 'rollback', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('old runtime')
    expect(fs.existsSync(snapshot)).toBe(false)
    const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'))
    expect(state.lastBackup).toBeNull()
    expect(state.runtimeBackup).toBeUndefined()
  })

  it('replays recorded timer state when a rollback restores the runtime', async () => {
    h = setupHarness()
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    expect(backupRuntimeFiles([runtimeKiosk(h)], snapshot)).toEqual({ ok: true })
    expect(writeTimerState(snapshot, [
      { unit: 'kiosk-update.timer', enabled: 'disabled', active: 'inactive' },
      { unit: 'kiosk-standby-on.timer', enabled: 'enabled', active: 'active' },
    ])).toEqual({ ok: true })
    fs.writeFileSync(runtimeKiosk(h), 'mixed runtime\n')
    fs.mkdirSync(path.dirname(h.statePath), { recursive: true })
    fs.writeFileSync(h.statePath, JSON.stringify({
      lastBackup: null,
      runtimeBackup: snapshot,
      installedVersion: '0.8.0',
    }))

    const result = await runCli(['update', 'rollback', '--yes'])
    expect(result.exitCode).toBe(0)
    const log = fs.readFileSync(h.logPath, 'utf8')
    expect(log).toContain('systemctl disable --now kiosk-update.timer')
    expect(log).toContain('systemctl enable kiosk-standby-on.timer')
    expect(log).toContain('systemctl start kiosk-standby-on.timer')
  })

  it('keeps the runtime snapshot when finishing recovery fails', async () => {
    h = setupHarness()
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    expect(backupRuntimeFiles([runtimeKiosk(h)], snapshot)).toEqual({ ok: true })
    fs.rmSync(path.join(snapshot, 'manifest.json'))
    fs.writeFileSync(runtimeKiosk(h), 'mixed runtime\n')
    fs.mkdirSync(path.dirname(h.statePath), { recursive: true })
    fs.writeFileSync(h.statePath, JSON.stringify({
      lastBackup: null,
      runtimeBackup: snapshot,
      installedVersion: '0.8.0',
    }))

    const result = await runCli(['update', 'rollback', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('runtime restore failed')
    expect(fs.readFileSync(runtimeKiosk(h), 'utf8').trim()).toBe('mixed runtime')
    expect(JSON.parse(fs.readFileSync(h.statePath, 'utf8')).runtimeBackup).toBe(snapshot)
  })

  it('keeps the snapshot when a manual rollback cannot restore the runtime', async () => {
    h = setupHarness()
    mockRelease(h)
    const apply = await runCli(['update', 'apply', '--yes'])
    expect(apply.exitCode).toBe(0)
    const snapshot = path.join(h.updateRoot, 'runtime-backup', '0.9.0')
    fs.rmSync(path.join(snapshot, 'manifest.json'))

    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(1)
    expect(rollback.stderr).toContain('app rolled back, but runtime restore failed')
    expect(appVersion(h)).toBe('0.8.0')
    const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'))
    expect(state.lastBackup).toBeNull()
    expect(state.runtimeBackup).toBe(snapshot)
    expect(fs.existsSync(snapshot)).toBe(true)
  })

  it('acquires a lock left behind by an exited process', async () => {
    h = setupHarness()
    mockRelease(h)
    fs.mkdirSync(h.updateRoot, { recursive: true })
    const Database = require('better-sqlite3')
    const db = new Database(path.join(h.updateRoot, 'lock.db'))
    db.pragma('busy_timeout = 0')
    db.exec('BEGIN EXCLUSIVE')
    db.close()

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(appVersion(h)).toBe('0.9.0')
  })

  it('releases the lock when the release fetch fails', async () => {
    h = setupHarness()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('fetch failed')

    mockRelease(h)
    const retry = await runCli(['update', 'apply', '--yes'])
    expect(retry.exitCode).toBe(0)
    expect(appVersion(h)).toBe('0.9.0')
  })

  it('downloads the requested tag instead of the latest release', async () => {
    h = setupHarness({ version: '0.8.5', installerVersion: '2.0' })
    mockRelease(h, '0.8.5')

    const result = await runCli(['update', 'apply', '--version', '0.8.5', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(appVersion(h)).toBe('0.8.5')
    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/releases/tags/v0.8.5'))).toBe(true)
  })

  it('reports the timer without contacting GitHub', async () => {
    h = setupHarness()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not fetch') }))

    const result = await runCli(['update', 'status', '--json'])
    expect(result.exitCode).toBe(0)
    const payload = JSON.parse(result.stdout)
    expect(payload.timerActive).toBe(true)
    expect(payload.timerEnabled).toBe(true)
    expect(payload.lastTrigger).toContain('2026-11-06')
  })

  it('refreshes the browser after a successful update health check', async () => {
    h = setupHarness()
    mockRelease(h)
    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(fs.readFileSync(h.logPath, 'utf8')).toContain('pkill -TERM -u kiosk -x surf')
  })
})
