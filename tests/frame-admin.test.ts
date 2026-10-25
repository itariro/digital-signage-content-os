import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  ADMIN_COOKIE,
  AdminConfigError,
  adminAuthEnabled,
  hashAdminPassword,
  isValidAdminSecret,
  requestHasAdmin,
  signAdminSession,
  verifyAdminSession,
  verifyAdminPassword,
} from '@/lib/frame-admin'
import { __resetLimits } from '@/lib/rate-limit'

const env = process.env as Record<string, string | undefined>

function loginRequest(password: string) {
  return new NextRequest('http://f:8808/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

async function login(password: string) {
  const { POST } = await import('@/app/api/admin/login/route')
  return POST(loginRequest(password))
}

beforeEach(() => { __resetLimits() })

afterEach(() => {
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
  delete env.TRUST_PROXY
})

describe('frame admin auth', () => {
  it('scrypt hash round-trips and rejects wrong secrets', () => {
    const stored = hashAdminPassword('correct horse battery staple')
    expect(verifyAdminPassword('correct horse battery staple', stored)).toBe(true)
    expect(verifyAdminPassword('wrong', stored)).toBe(false)
    expect(stored).not.toContain('correct horse battery staple')
  })

  it('HMAC session verifies, expires, and rejects foreign signatures', async () => {
    const secret = 'a'.repeat(32)
    const nowMs = 1_700_000_000_000
    const token = await signAdminSession(secret, nowMs)
    expect(await verifyAdminSession(token, secret, nowMs)).toBe(true)
    expect(await verifyAdminSession(token, secret, nowMs + 7 * 24 * 3600_000 - 1000)).toBe(true)
    expect(await verifyAdminSession(token, secret, nowMs + 8 * 24 * 3600_000)).toBe(false)
    expect(await verifyAdminSession(token, 'b'.repeat(32), nowMs)).toBe(false)
    expect(await verifyAdminSession('garbage', secret, nowMs)).toBe(false)
  })

  it('accepts only 32-128 base64url admin secrets', () => {
    expect(isValidAdminSecret('a'.repeat(32))).toBe(true)
    expect(isValidAdminSecret('A_b-9'.repeat(8))).toBe(true)
    expect(isValidAdminSecret('a'.repeat(128))).toBe(true)
    for (const value of [
      undefined,
      '',
      'a'.repeat(31),
      'a'.repeat(129),
      ' '.repeat(32),
      'a'.repeat(31) + '\n',
      'a'.repeat(31) + '=',
      'a'.repeat(31) + '+',
      'a'.repeat(31) + '/',
    ]) {
      expect(isValidAdminSecret(value)).toBe(false)
    }
  })

  it('signAdminSession refuses an invalid secret', async () => {
    for (const value of ['', ' '.repeat(32), 'a'.repeat(31), 'a'.repeat(31) + '=']) {
      await expect(signAdminSession(value)).rejects.toBeInstanceOf(AdminConfigError)
    }
  })

  it('verifyAdminSession rejects an invalid configured secret', async () => {
    const token = await signAdminSession('a'.repeat(32))
    expect(await verifyAdminSession(token, 'short')).toBe(false)
  })

  it('adminAuthEnabled requires both a hash and a valid secret', () => {
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')
    expect(adminAuthEnabled()).toBe(false)
    env.FRAME_ADMIN_SECRET = 'short'
    expect(adminAuthEnabled()).toBe(false)
    env.FRAME_ADMIN_SECRET = 'a'.repeat(32)
    expect(adminAuthEnabled()).toBe(true)
    delete env.FRAME_ADMIN_HASH
    expect(adminAuthEnabled()).toBe(false)
  })

  it('accepts a cookie header without a space after the semicolon', async () => {
    const secret = 'a'.repeat(32)
    env.FRAME_ADMIN_SECRET = secret
    const token = await signAdminSession(secret)
    expect(await requestHasAdmin(new Headers({ cookie: `other=1;${ADMIN_COOKIE}=${token}` }))).toBe(true)
  })

  it('login route sets the cookie and no-store when configured', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('let-me-in')

    const res = await login('let-me-in')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`${ADMIN_COOKIE}=admin.`)
    expect(cookie).toContain('HttpOnly')
    expect(await verifyAdminSession(
      cookie.split(';')[0].slice(ADMIN_COOKIE.length + 1),
      env.FRAME_ADMIN_SECRET,
      Date.now(),
    )).toBe(true)
  })

  it('wrong-password and unset-hash 401s return the same body', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')

    const wrong = await login('wrong')
    delete env.FRAME_ADMIN_HASH
    const unset = await login('right')
    expect(wrong.status).toBe(401)
    expect(unset.status).toBe(401)
    expect(JSON.stringify(await unset.json())).toBe(JSON.stringify(await wrong.json()))
  })

  it('returns one generic 401 with no cookie when the secret is unavailable', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')

    for (const secret of [undefined, '', 'short']) {
      if (secret === undefined) delete env.FRAME_ADMIN_SECRET
      else env.FRAME_ADMIN_SECRET = secret
      __resetLimits()
      const res = await login('right')
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(await res.json()).toEqual({ error: 'unauthorized' })
    }
  })

  it('adds Retry-After to a rate-limited login', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'

    for (let i = 0; i < 10; i++) expect((await login('right')).status).toBe(401)
    const limited = await login('right')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
  })
})
