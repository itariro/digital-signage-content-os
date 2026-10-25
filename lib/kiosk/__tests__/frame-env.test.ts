import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeFrameEnv, frameEnvLines, parseFrameEnv, setFrameEnvValue } from '@/lib/kiosk/frame-env'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'))
const target = path.join(dir, 'frame.env')

afterEach(() => { fs.rmSync(target, { force: true }) })

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
    const res = await runCli(['enroll', 'https://console.test', 'CODE'])
    globalThis.fetch = ORIGINAL
    expect(res.exitCode).toBe(0)
    expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe('dt')
    delete process.env.FRAME_ENV_PATH
    fs.rmSync(file, { force: true })
  })

  it('exits 1 and writes nothing on 401', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'fail-frame.env')
    process.env.FRAME_ENV_PATH = file
    const ORIGINAL = globalThis.fetch
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
    const res = await runCli(['enroll', 'https://console.test', 'BAD'])
    globalThis.fetch = ORIGINAL
    expect(res.exitCode).toBe(1)
    expect(fs.existsSync(file)).toBe(false)
    delete process.env.FRAME_ENV_PATH
  })
})
