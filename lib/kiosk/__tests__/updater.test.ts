import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { validateStaging, switchRelease, rollbackRelease } from '../updater'

describe('updater', () => {
  it('validateStaging false on empty', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-'))
    expect(validateStaging(d)).toBe(false)
  })
  it('validateStaging true with package.json + .next', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-'))
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '1.0.0' }))
    fs.mkdirSync(path.join(d, '.next'))
    expect(validateStaging(d)).toBe(true)
  })
  it('switchRelease moves staging to appDir', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
    const appDir = path.join(base, 'app')
    const staging = path.join(base, 'stg')
    const backup = path.join(base, 'bak')
    fs.mkdirSync(appDir); fs.writeFileSync(path.join(appDir, 'old'), 'x')
    fs.mkdirSync(staging); fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ version: '1.0.0' })); fs.mkdirSync(path.join(staging, '.next'))
    const r = switchRelease({ appDir, staging, backup })
    expect(r.ok).toBe(true)
    expect(fs.existsSync(path.join(appDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(backup)).toBe(true)
  })
  it('rollbackRelease restores backup', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
    const appDir = path.join(base, 'app')
    const backup = path.join(base, 'bak')
    fs.mkdirSync(backup); fs.writeFileSync(path.join(backup, 'package.json'), JSON.stringify({ version: '0.9.0' }))
    fs.mkdirSync(appDir); fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ version: '1.0.0' }))
    const r = rollbackRelease({ appDir, backup })
    expect(r.ok).toBe(true)
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
    expect(pkg.version).toBe('0.9.0')
  })
})