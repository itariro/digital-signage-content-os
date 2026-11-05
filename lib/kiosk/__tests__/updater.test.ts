import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  validateStaging,
  switchRelease,
  rollbackRelease,
  acquireUpdateLock,
  backupRuntimeFiles,
  restoreRuntimeFiles,
} from '../updater'

function makeStaging(version = '1.0.0'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-'))
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version }))
  fs.mkdirSync(path.join(d, '.next'))
  fs.mkdirSync(path.join(d, 'node_modules'))
  fs.mkdirSync(path.join(d, 'lib', 'kiosk'), { recursive: true })
  fs.writeFileSync(path.join(d, 'lib', 'kiosk', 'cli.ts'), '// cli')
  fs.writeFileSync(path.join(d, 'install-kiosk.sh'), 'readonly INSTALLER_VERSION="2.0"\n')
  return d
}

describe('updater', () => {
  it('validateStaging false on empty', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stg-'))
    expect(validateStaging(d)).toBe(false)
  })
  it('validateStaging true with package.json, .next, node_modules and CLI', () => {
    expect(validateStaging(makeStaging())).toBe(true)
  })
  it('validateStaging rejects a version mismatch', () => {
    expect(validateStaging(makeStaging('1.0.0'), '2.0.0')).toBe(false)
  })
  it('switchRelease moves staging to appDir', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
    const appDir = path.join(base, 'app')
    const staging = makeStaging()
    const backup = path.join(base, 'bak')
    fs.mkdirSync(appDir); fs.writeFileSync(path.join(appDir, 'old'), 'x')
    const r = switchRelease({ appDir, staging, backup })
    expect(r.ok).toBe(true)
    expect(fs.existsSync(path.join(appDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(backup)).toBe(true)
  })
  it('switchRelease restores the old app when the second rename fails', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
    const appDir = path.join(base, 'app')
    const staging = makeStaging()
    const backup = path.join(base, 'bak')
    fs.mkdirSync(appDir); fs.writeFileSync(path.join(appDir, 'old'), 'x')
    const realRename = fs.renameSync
    let calls = 0
    const fsImpl: any = {
      ...fs,
      renameSync: (from: fs.PathLike, to: fs.PathLike) => {
        calls += 1
        if (calls === 2) throw new Error('rename failed')
        return realRename(from, to)
      },
    }
    const r = switchRelease({ appDir, staging, backup, fsImpl })
    expect(r.ok).toBe(false)
    expect(fs.existsSync(path.join(appDir, 'old'))).toBe(true)
    expect(fs.existsSync(staging)).toBe(true)
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
  it('rollbackRelease keeps the current app when the backup rename fails', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'))
    const appDir = path.join(base, 'app')
    const backup = path.join(base, 'bak')
    fs.mkdirSync(backup); fs.writeFileSync(path.join(backup, 'package.json'), JSON.stringify({ version: '0.9.0' }))
    fs.mkdirSync(appDir); fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ version: '1.0.0' }))
    const realRename = fs.renameSync
    let calls = 0
    const fsImpl: any = {
      ...fs,
      renameSync: (from: fs.PathLike, to: fs.PathLike) => {
        calls += 1
        if (calls === 2) throw new Error('rename failed')
        return realRename(from, to)
      },
    }
    const r = rollbackRelease({ appDir, backup, fsImpl })
    expect(r.ok).toBe(false)
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
    expect(pkg.version).toBe('1.0.0')
  })

  describe('update lock', () => {
    it('creates and releases a lock', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'))
      const lockPath = path.join(dir, 'lock.db')
      const lock = await acquireUpdateLock(lockPath, { timeoutMs: 0 })
      expect(lock).not.toBeNull()
      expect(fs.existsSync(lockPath)).toBe(true)
      lock!.release()
      const again = await acquireUpdateLock(lockPath, { timeoutMs: 0 })
      expect(again).not.toBeNull()
      again!.release()
    })

    it('does not take a lock held by a live process', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'))
      const lockPath = path.join(dir, 'lock.db')
      const first = await acquireUpdateLock(lockPath, { timeoutMs: 0 })
      expect(first).not.toBeNull()
      const second = await acquireUpdateLock(lockPath, { timeoutMs: 0 })
      expect(second).toBeNull()
      first!.release()
    })

    it('drops an abandoned lock when its process dies', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'))
      const lockPath = path.join(dir, 'lock.db')
      const child = await startLockHolder(lockPath)
      try {
        expect(await acquireUpdateLock(lockPath, { timeoutMs: 0 })).toBeNull()
      } finally {
        child.kill('SIGKILL')
      }
      await once(child, 'exit')
      const lock = await acquireUpdateLock(lockPath, { timeoutMs: 0 })
      expect(lock).not.toBeNull()
      lock!.release()
    })
  })

  describe('runtime files', () => {
    it('restores contents and modes, and removes files that did not exist', () => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'))
      const bin = path.join(base, 'bin')
      fs.mkdirSync(bin)
      const present = path.join(bin, 'kiosk')
      const missing = path.join(bin, 'standby')
      const snapshot = path.join(base, 'snapshot')
      fs.writeFileSync(present, 'old', { mode: 0o755 })

      expect(backupRuntimeFiles([present, missing], snapshot)).toEqual({ ok: true })
      fs.writeFileSync(present, 'new')
      fs.chmodSync(present, 0o644)
      fs.writeFileSync(missing, 'new', { mode: 0o755 })

      expect(restoreRuntimeFiles(snapshot)).toEqual({ ok: true })
      expect(fs.readFileSync(present, 'utf8')).toBe('old')
      expect(fs.statSync(present).mode & 0o777).toBe(0o755)
      expect(fs.existsSync(missing)).toBe(false)
    })

    it('fails when the snapshot has no manifest', () => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'))
      const result = restoreRuntimeFiles(path.join(base, 'missing'))
      expect(result.ok).toBe(false)
    })
  })
})

async function startLockHolder(lockPath: string) {
  const script = `
    const Database = require('better-sqlite3')
    const db = new Database(process.argv[1])
    db.pragma('busy_timeout = 0')
    db.exec('BEGIN EXCLUSIVE')
    process.stdout.write('ready\\n')
    setInterval(() => {}, 1000)
  `
  const child = spawn(process.execPath, ['-e', script, lockPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise<void>((resolve, reject) => {
    let output = ''
    child.stdout!.on('data', (chunk) => {
      output += chunk
      if (output.includes('ready')) resolve()
    })
    child.once('exit', (code) => reject(new Error(`lock holder exited early (${code})`)))
  })
  return child
}
