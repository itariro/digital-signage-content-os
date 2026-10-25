import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { FrameEnvError, frameEnvLines, parseFrameEnv, setFrameEnvValue, writeFrameEnv } from '@/lib/kiosk/frame-env'

let dir: string
let target: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'))
  target = path.join(dir, 'frame.env')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.FRAME_ENV_PATH
  delete process.env.FRAME_ADMIN_SECRET
})

describe('frame.env writer', () => {
  it('serializes the bundle keys, one per line', () => {
    const text = frameEnvLines({ FRAME_MODE: 'instance', SYNC_TOKEN: 'tok' })
    expect(text).toBe('FRAME_MODE=instance\nSYNC_TOKEN=tok\n')
  })

  it('writes atomically with 0640 and readable roundtrip', () => {
    writeFrameEnv(target, { INSTANCE_ID: 'i1', SYNC_TOKEN: 'tok' })
    expect(fs.statSync(target).mode & 0o777).toBe(0o640)
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ INSTANCE_ID: 'i1', SYNC_TOKEN: 'tok' })
  })

  it('setFrameEnvValue adds or replaces a key, preserving the rest', () => {
    writeFrameEnv(target, { A: '1', B: '2' })
    setFrameEnvValue(target, 'B', '3')
    setFrameEnvValue(target, 'C', '4')
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ A: '1', B: '3', C: '4' })
    expect(fs.statSync(target).mode & 0o777).toBe(0o640)
  })

  it('round-trips a value containing =', () => {
    expect(frameEnvLines({ TOKEN: 'a=b' })).toBe('TOKEN=a=b\n')
    expect(parseFrameEnv(frameEnvLines({ TOKEN: 'a=b' }))).toEqual({ TOKEN: 'a=b' })
  })

  it('rejects invalid keys and values before writing', () => {
    for (const key of ['lower', '1LEADING', 'WITH-DASH', 'WITH SPACE', '', 'OK\n']) {
      expect(() => frameEnvLines({ [key]: 'ok' })).toThrow(FrameEnvError)
    }
    for (const value of ['a\nb', 'a\rb', 'a\0b', 'a\tb', ' leading', 'trailing ', 'a\u007fb']) {
      expect(() => frameEnvLines({ OK: value })).toThrow(FrameEnvError)
    }
    expect(fs.existsSync(target)).toBe(false)
    expect(() => writeFrameEnv(target, { TOKEN: 'a\nb' })).toThrow(FrameEnvError)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('names the bad key but never echoes the value', () => {
    try {
      frameEnvLines({ SYNC_TOKEN: 'secret-value\nB=evil' })
      expect.unreachable('expected a FrameEnvError')
    } catch (error) {
      expect(error).toBeInstanceOf(FrameEnvError)
      const message = (error as Error).message
      expect(message).toContain('SYNC_TOKEN')
      expect(message).not.toContain('secret-value')
    }
  })

  it('leaves no temp file and keeps the old file when the rename fails', () => {
    writeFrameEnv(target, { KEEP: 'old' })
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed')
    })
    try {
      expect(() => writeFrameEnv(target, { KEEP: 'new' })).toThrow('rename failed')
    } finally {
      spy.mockRestore()
    }
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ KEEP: 'old' })
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('frame.env.tmp.'))).toEqual([])
  })

  it('uses a unique temp file for each write', () => {
    const opened: string[] = []
    const realOpen = fs.openSync.bind(fs)
    const spy = vi.spyOn(fs, 'openSync').mockImplementation(((file: any, flags: any, mode?: any) => {
      if (typeof file === 'string' && file.startsWith(`${target}.tmp.`)) opened.push(file)
      return realOpen(file, flags, mode)
    }) as any)
    try {
      writeFrameEnv(target, { A: '1' })
      writeFrameEnv(target, { B: '2' })
    } finally {
      spy.mockRestore()
    }
    expect(opened).toHaveLength(2)
    expect(opened[0]).not.toBe(opened[1])
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ B: '2' })
  })

  it('creates a missing parent directory with mode 0750', () => {
    const nested = path.join(dir, 'etc', 'dscos')
    writeFrameEnv(path.join(nested, 'frame.env'), { A: '1' })
    expect(fs.statSync(nested).mode & 0o777).toBe(0o750)
    expect(fs.statSync(path.join(nested, 'frame.env')).mode & 0o777).toBe(0o640)
  })

  it('leaves the existing file untouched when a merged value is invalid', () => {
    writeFrameEnv(target, { A: '1' })
    expect(() => setFrameEnvValue(target, 'bad-key', 'x')).toThrow(FrameEnvError)
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ A: '1' })
  })
})

describe('kiosk enroll command', () => {
  it('writes frame.env from the redeem response and exits 0', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'cli-frame.env')
    process.env.FRAME_ENV_PATH = file
    const ORIGINAL = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({
      instanceId: 'c1', deviceToken: 'dt', syncEndpoint: 'https://console.test/api/sync', frameAdminSecret: 'sec',
    }))) as typeof fetch
    try {
      const res = await runCli(['enroll', 'https://console.test', 'CODE'])
      expect(res.exitCode).toBe(0)
      expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe('dt')
    } finally {
      globalThis.fetch = ORIGINAL
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('exits 1 and writes nothing on 401', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'fail-frame.env')
    process.env.FRAME_ENV_PATH = file
    const ORIGINAL = globalThis.fetch
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
    try {
      const res = await runCli(['enroll', 'https://console.test', 'BAD'])
      expect(res.exitCode).toBe(1)
      expect(fs.existsSync(file)).toBe(false)
    } finally {
      globalThis.fetch = ORIGINAL
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })
})

describe('kiosk password command', () => {
  it('mints FRAME_ADMIN_SECRET when missing and writes the hash', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-mint.env')
    process.env.FRAME_ENV_PATH = file
    try {
      const res = await runCli(['password', 'secret123'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(env.FRAME_ADMIN_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(res.stdout).toContain('generated FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('preserves an existing FRAME_ADMIN_SECRET and only updates the hash', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-preserve.env')
    process.env.FRAME_ENV_PATH = file
    const existing = 'v'.repeat(43)
    writeFrameEnv(file, { FRAME_ADMIN_SECRET: existing })
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toBe(existing)
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(res.stdout).not.toContain('generated FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('rejects passwords shorter than 8 chars and writes nothing', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-short.env')
    process.env.FRAME_ENV_PATH = file
    try {
      const res = await runCli(['password', 'short'])
      expect(res.exitCode).toBe(1)
      expect(fs.existsSync(file)).toBe(false)
      expect(res.stderr).toContain('password too short')
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('persists an env-only FRAME_ADMIN_SECRET into frame.env', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-env.env')
    process.env.FRAME_ENV_PATH = file
    process.env.FRAME_ADMIN_SECRET = 'e'.repeat(43)
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toBe('e'.repeat(43))
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(res.stdout).not.toContain('generated FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      delete process.env.FRAME_ADMIN_SECRET
      fs.rmSync(file, { force: true })
    }
  })

  it('replaces an invalid stored secret with a warning', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-invalid.env')
    process.env.FRAME_ENV_PATH = file
    writeFrameEnv(file, { FRAME_ADMIN_SECRET: 'too-short' })
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(env.FRAME_ADMIN_SECRET).not.toBe('too-short')
      expect(res.stderr).toContain('replaced invalid FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('writes the secret and hash together with no temp file left behind', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-once.env')
    process.env.FRAME_ENV_PATH = file
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toBeTruthy()
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(fs.readdirSync(dir).filter((name) => name.startsWith('password-once.env.tmp.'))).toEqual([])
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })
})
