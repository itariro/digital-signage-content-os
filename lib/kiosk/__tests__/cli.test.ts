import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCli } from '../cli'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

describe('cli', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-'))
  const cfgPath = path.join(tmpDir, 'kiosk.json')

  beforeEach(() => {
    process.env.KIOSK_CONFIG_PATH = cfgPath
    try { fs.unlinkSync(cfgPath) } catch {}
  })

  it('shows help', async () => {
    const r = await runCli(['--help'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('kiosk - Digital frame management CLI')
  })

  it('config set and show', async () => {
    const r1 = await runCli(['config', 'set', 'standby.start', '23:00'])
    expect(r1.exitCode).toBe(0)
    const r2 = await runCli(['config', 'show'])
    expect(r2.stdout).toContain('23:00')
  })

  it('validates config', async () => {
    await runCli(['config', 'set', 'appPort', 'abc' as any])
    // setConfigValue throws on NaN; expect failure
  })

  it('standby schedule set', async () => {
    const r = await runCli(['standby', 'schedule', 'set', '22:00', '06:00'])
    expect(r.exitCode).toBe(0)
  })

  it('round-trips kiosk.conf including mgmtPort', async () => {
    const confPath = path.join(tmpDir, 'kiosk.conf')
    process.env.KIOSK_CONFIG_PATH = confPath
    fs.writeFileSync(confPath, "KIOSK_MGMT_PORT=9911\nKIOSK_PORT=3300\n", { mode: 0o600 })
    const r1 = await runCli(['config', 'show'])
    expect(r1.exitCode).toBe(0)
    expect(r1.stdout).toContain('"mgmtPort": 9911')
    expect(r1.stdout).toContain('"appPort": 3300')
    const r2 = await runCli(['config', 'set', 'mgmtPort', '8808'])
    expect(r2.exitCode).toBe(0)
    const written = fs.readFileSync(confPath, 'utf8')
    expect(written).toContain('KIOSK_MGMT_PORT=8808')
    expect(written).toContain('KIOSK_PORT=3300')
  })

  it('version prints versions', async () => {
    const r = await runCli(['version'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('installer:')
  })

  it('reset requires --yes', async () => {
    const r = await runCli(['reset'])
    expect(r.exitCode).toBe(2)
  })

  it('reset with --yes restores defaults', async () => {
    await runCli(['config', 'set', 'standby.start', '23:00'])
    const r = await runCli(['reset', '--yes'])
    expect(r.exitCode).toBe(0)
    const r2 = await runCli(['config', 'show'])
    expect(r2.stdout).toContain('22:00')
  })

  it('unknown command returns 2', async () => {
    const r = await runCli(['frobnicate'])
    expect(r.exitCode).toBe(2)
  })

  function fakeBin(root: string, opts: { healthCode?: string; pkill?: number; pgrep?: string } = {}): { binDir: string; logPath: string } {
    const binDir = path.join(root, 'bin')
    const logPath = path.join(root, 'cmds.log')
    fs.mkdirSync(binDir, { recursive: true })
    const writeSh = (name: string, body: string) =>
      fs.writeFileSync(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    writeSh('systemctl', 'echo "systemctl $*" >> "$FAKE_LOG"\nif [ "$1" = is-active ]; then echo active; fi\nexit 0')
    writeSh('pkill', `echo "pkill $*" >> "$FAKE_LOG"\nexit ${opts.pkill ?? 0}`)
    writeSh('pgrep', `echo "pgrep $*" >> "$FAKE_LOG"\n${opts.pgrep ? `echo "${opts.pgrep}"` : 'exit 1'}`)
    writeSh('curl', `echo "curl $*" >> "$FAKE_LOG"\necho ${opts.healthCode ?? '200'}`)
    writeSh('sleep', 'exit 0')
    return { binDir, logPath }
  }

  it('app restart reloads the browser after the app is healthy; pkill failure does not fail the command', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-browser-'))
    const { binDir, logPath } = fakeBin(root, { pkill: 1 })
    const origPath = process.env.PATH
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

  it('app restart leaves the browser alone while the app is not healthy', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-browser-'))
    const { binDir, logPath } = fakeBin(root, { healthCode: '503' })
    const origPath = process.env.PATH
    process.env.FAKE_LOG = logPath
    process.env.PATH = `${binDir}:${origPath}`
    try {
      const r = await runCli(['app', 'restart'])
      expect(r.exitCode).toBe(0)
      expect(fs.readFileSync(logPath, 'utf8')).not.toContain('pkill')
      expect(r.stderr).toContain('browser left on its current page')
    } finally {
      process.env.PATH = origPath
      delete process.env.FAKE_LOG
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('app restart reports an unconfirmed refresh when surf cannot be signalled', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-browser-'))
    const { binDir, logPath } = fakeBin(root, { pkill: 1, pgrep: '4242' })
    const origPath = process.env.PATH
    process.env.FAKE_LOG = logPath
    process.env.PATH = `${binDir}:${origPath}`
    try {
      const r = await runCli(['app', 'restart'])
      expect(r.exitCode).toBe(0)
      expect(r.stderr).toContain('browser refresh not confirmed')
      expect(r.stderr).toContain('4242')
    } finally {
      process.env.PATH = origPath
      delete process.env.FAKE_LOG
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
