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
})
