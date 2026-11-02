import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chownToKioskGroup, enroll } from '@/lib/kiosk/enroll'
import { parseFrameEnv } from '@/lib/kiosk/frame-env'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-enroll-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const validBundle = {
  instanceId: 'inst1234',
  deviceToken: 'd'.repeat(32),
  syncEndpoint: 'https://console.test/api/sync',
  frameAdminSecret: 's'.repeat(43),
  config: { clerkPublishableKey: 'pk_test_abc123' },
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('kiosk enroll client', () => {
  it('rejects non-loopback http before making a request', async () => {
    const fetchMock = vi.fn()
    const file = path.join(dir, 'http.env')
    const res = await enroll('http://console.example.com', 'code', {
      fetch: fetchMock as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('https')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('accepts loopback http URLs for development', async () => {
    for (const [index, url] of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'].entries()) {
      const file = path.join(dir, `loop-${index}.env`)
      const fetchMock = vi.fn(async () => response(validBundle))
      const res = await enroll(url, 'code', {
        fetch: fetchMock as unknown as typeof fetch,
        envPath: file,
      })
      expect(res.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe(validBundle.deviceToken)
    }
  })

  it('rejects credentials, a query, or a fragment in the console URL', async () => {
    for (const url of [
      'https://user:pass@console.test',
      'https://console.test/?tenant=1',
      'https://console.test/#setup',
    ]) {
      const fetchMock = vi.fn()
      const res = await enroll(url, 'code', {
        fetch: fetchMock as unknown as typeof fetch,
        envPath: path.join(dir, 'bad-url.env'),
      })
      expect(res.ok).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(dir, 'bad-url.env'))).toBe(false)
    }
  })

  it('keeps the console path and appends the enroll endpoint', async () => {
    const file = path.join(dir, 'path.env')
    const fetchMock = vi.fn(async () => response(validBundle))
    const res = await enroll('https://console.test/base', 'code', {
      fetch: fetchMock as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(true)
    expect((fetchMock as any).mock.calls[0][0]).toBe('https://console.test/base/api/enroll')
  })

  it('aborts a stalled request and writes nothing', async () => {
    const file = path.join(dir, 'timeout.env')
    const fetchMock = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      })
    })) as unknown as typeof fetch
    const res = await enroll('https://console.test', 'code', {
      fetch: fetchMock,
      envPath: file,
      timeoutMs: 10,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('timed out')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects a non-JSON response and writes nothing', async () => {
    const file = path.join(dir, 'non-json.env')
    const res = await enroll('https://console.test', 'code', {
      fetch: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('non-JSON')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects malformed bundles and writes nothing', async () => {
    const cases = [
      { ...validBundle, instanceId: '' },
      { ...validBundle, instanceId: 'inst1234\n' },
      { ...validBundle, deviceToken: 'short' },
      { ...validBundle, deviceToken: 'd'.repeat(32) + '\n' },
      { ...validBundle, syncEndpoint: 'http://console.test/api/sync' },
      { ...validBundle, syncEndpoint: 'https://console.test/api/sync\n' },
      { ...validBundle, frameAdminSecret: 'short' },
      { ...validBundle, frameAdminSecret: 's'.repeat(42) + '\n' },
      { ...validBundle, frameAdminSecret: undefined },
    ]
    for (const [index, bundle] of cases.entries()) {
      const file = path.join(dir, `bad-bundle-${index}.env`)
      const res = await enroll('https://console.test', 'code', {
        fetch: (async () => response(bundle)) as unknown as typeof fetch,
        envPath: file,
      })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('invalid enrollment bundle')
      expect(fs.existsSync(file)).toBe(false)
    }
  })

  it('writes every bundle key and a 0640 file for a valid response', async () => {
    const file = path.join(dir, 'valid.env')
    const res = await enroll('https://console.test', 'code', {
      fetch: (async () => response(validBundle)) as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(true)
    const vars = parseFrameEnv(fs.readFileSync(file, 'utf8'))
    expect(vars).toMatchObject({
      FRAME_MODE: 'instance',
      SYNC_ENABLED: 'true',
      SYNC_ENDPOINT: validBundle.syncEndpoint,
      INSTANCE_ID: validBundle.instanceId,
      SYNC_TOKEN: validBundle.deviceToken,
      FRAME_ADMIN_SECRET: validBundle.frameAdminSecret,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: validBundle.config.clerkPublishableKey,
    })
    expect(fs.statSync(file).mode & 0o777).toBe(0o640)
  })

  it('returns a warning when root cannot resolve the kiosk group', () => {
    const file = path.join(dir, 'chown.env')
    fs.writeFileSync(file, 'A=1\n')
    const warning = chownToKioskGroup(file, { getuid: () => 0, exec: () => '' })
    expect(warning).toContain('could not set kiosk group ownership')
    expect(warning).toContain(`chown root:kiosk ${file}`)
  })
})
