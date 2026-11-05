import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runCli } from '../cli'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

const originalPath = process.env.PATH
const originalEnv = {
  KIOSK_UPDATE_ROOT: process.env.KIOSK_UPDATE_ROOT,
  KIOSK_UPDATE_STATE: process.env.KIOSK_UPDATE_STATE,
  KIOSK_INSTALLER_VERSION_FILE: process.env.KIOSK_INSTALLER_VERSION_FILE,
  DSCOS_APP_DIR: process.env.DSCOS_APP_DIR,
  KIOSK_CONFIG_PATH: process.env.KIOSK_CONFIG_PATH,
  FAKE_LOG: process.env.FAKE_LOG,
  FAKE_RESTART_FAIL: process.env.FAKE_RESTART_FAIL,
  FAKE_BASH_FAIL: process.env.FAKE_BASH_FAIL,
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

  for (const dir of [path.join(appDir, 'lib', 'kiosk'), path.join(appDir, '.next'), path.join(appDir, 'node_modules'), binDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ version: '0.8.0' }))
  fs.writeFileSync(path.join(appDir, 'lib', 'kiosk', 'cli.ts'), '// old cli')
  fs.writeFileSync(cfgPath, 'KIOSK_PORT=3000\n')
  fs.writeFileSync(versionFile, '2.0\n')

  writeExecutable(path.join(binDir, 'systemctl'), `
echo "systemctl $*" >> "$FAKE_LOG"
if [ "$1" = "restart" ] && [ "\${FAKE_RESTART_FAIL:-0}" = "1" ]; then
  echo "restart failed" >&2
  exit 1
fi
if [ "$1" = "is-active" ]; then echo active; exit 0; fi
if [ "$1" = "is-enabled" ]; then echo enabled; exit 0; fi
if [ "$1" = "show" ]; then echo "Thu 2026-11-06 03:00:00 UTC"; exit 0; fi
exit 0
`)
  writeExecutable(path.join(binDir, 'curl'), 'echo 200')
  writeExecutable(path.join(binDir, 'bash'), `
echo "bash $*" >> "$FAKE_LOG"
if [ "\${FAKE_BASH_FAIL:-0}" = "1" ]; then echo "runtime boom" >&2; exit 1; fi
`)

  const tarPath = makeReleaseTar(root, version, installerVersion)

  process.env.KIOSK_UPDATE_ROOT = updateRoot
  process.env.KIOSK_UPDATE_STATE = statePath
  process.env.KIOSK_INSTALLER_VERSION_FILE = versionFile
  process.env.DSCOS_APP_DIR = appDir
  process.env.KIOSK_CONFIG_PATH = cfgPath
  process.env.FAKE_LOG = logPath
  process.env.PATH = `${binDir}:${originalPath}`
  delete process.env.FAKE_RESTART_FAIL
  delete process.env.FAKE_BASH_FAIL

  return { root, appDir, binDir, cfgPath, versionFile, logPath, updateRoot, statePath, tarPath }
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
    const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'))
    expect(state.lastBackup).toBe(path.join(h.updateRoot, 'backup', '0.9.0'))

    const rollback = await runCli(['update', 'rollback', '--yes'])
    expect(rollback.exitCode).toBe(0)
    expect(rollback.stdout).toContain('rolled back')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.0')
    expect(JSON.parse(fs.readFileSync(h.statePath, 'utf8')).lastBackup).toBeNull()
  })

  it('restores the previous app when the restart fails', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_RESTART_FAIL = '1'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/rollback|rolled back/)
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.readFileSync(h.versionFile, 'utf8').trim()).toBe('2.0')
  })

  it('keeps the old app when the runtime helper install fails', async () => {
    h = setupHarness()
    mockRelease(h)
    process.env.FAKE_BASH_FAIL = '1'

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('runtime update failed')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.existsSync(path.join(h.updateRoot, 'backup'))).toBe(false)
  })

  it('keeps the app when the switch cannot create its backup', async () => {
    h = setupHarness()
    mockRelease(h)
    fs.mkdirSync(path.join(h.updateRoot, 'backup'), { recursive: true })
    fs.writeFileSync(path.join(h.updateRoot, 'backup', '0.9.0'), 'not a directory')

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('switch failed')
    expect(appVersion(h)).toBe('0.8.0')
    expect(fs.existsSync(path.join(h.appDir, '.next'))).toBe(true)
  })

  it('recovers an abandoned lock from a previous update', async () => {
    h = setupHarness()
    mockRelease(h)
    fs.mkdirSync(h.updateRoot, { recursive: true })
    fs.writeFileSync(path.join(h.updateRoot, 'lock'), JSON.stringify({
      token: 'abandoned', pid: 999999, startedAt: 1, bootId: null, startTime: null,
    }))

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(0)
    expect(appVersion(h)).toBe('0.9.0')
    expect(fs.existsSync(path.join(h.updateRoot, 'lock'))).toBe(false)
  })

  it('releases the lock when the release fetch fails', async () => {
    h = setupHarness()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    const result = await runCli(['update', 'apply', '--yes'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('fetch failed')
    expect(fs.existsSync(path.join(h.updateRoot, 'lock'))).toBe(false)
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
})
