import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { hashAdminPassword, verifyAdminPassword, signAdminSession, verifyAdminSession, ADMIN_COOKIE } from '@/lib/frame-admin'

const env = process.env as Record<string, string | undefined>

describe('frame admin auth', () => {
  it('scrypt hash round-trips and rejects wrong secrets', () => {
    const stored = hashAdminPassword('correct horse battery staple')
    expect(verifyAdminPassword('correct horse battery staple', stored)).toBe(true)
    expect(verifyAdminPassword('wrong', stored)).toBe(false)
    expect(stored).not.toContain('correct horse battery staple')
  })

  it('HMAC session verifies, expires, and rejects foreign signatures', () => {
    const secret = 'a'.repeat(32)
    const nowMs = 1_700_000_000_000
    const token = signAdminSession(secret, nowMs)
    expect(verifyAdminSession(token, secret, nowMs)).toBe(true)
    expect(verifyAdminSession(token, secret, nowMs + 7 * 24 * 3600_000 - 1000)).toBe(true)
    expect(verifyAdminSession(token, secret, nowMs + 8 * 24 * 3600_000)).toBe(false)
    expect(verifyAdminSession(token, 'b'.repeat(32), nowMs)).toBe(false)
    expect(verifyAdminSession('garbage', secret, nowMs)).toBe(false)
  })

  it('login route sets the cookie when FRAME_ADMIN_HASH is configured', async () => {
    env.FRAME_MODE = 'instance'; delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'; env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('let-me-in')
    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/admin/login/route')
    const res = await POST(new NextRequest('http://f:8808/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'let-me-in' }),
    }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`${ADMIN_COOKIE}=admin.`)
    expect(cookie).toContain('HttpOnly')
    expect(verifyAdminSession(cookie.split(';')[0].slice(ADMIN_COOKIE.length + 1), env.FRAME_ADMIN_SECRET, Date.now())).toBe(true)
  })

  it('wrong-password and unset-hash 401s return the same body', async () => {
    env.FRAME_MODE = 'instance'; delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'; env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')
    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/admin/login/route')
    const wrong = await POST(new NextRequest('http://f:8808/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }),
    }))
    delete env.FRAME_ADMIN_HASH
    const unset = await POST(new NextRequest('http://f:8808/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'right' }),
    }))
    expect(wrong.status).toBe(401)
    expect(unset.status).toBe(401)
    expect(JSON.stringify(await unset.json())).toBe(JSON.stringify(await wrong.json()))
  })

  it('login returns 401 when the configured password is wrong, 401 when unset', async () => {
    env.FRAME_MODE = 'instance'; delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'; env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')
    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/admin/login/route')
    const wrong = await POST(new NextRequest('http://f:8808/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }),
    }))
    expect(wrong.status).toBe(401)
    delete env.FRAME_ADMIN_HASH
    const unset = await POST(new NextRequest('http://f:8808/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' }),
    }))
    expect(unset.status).toBe(401)
  })

  afterEach(() => { delete env.FRAME_ADMIN_HASH; delete env.FRAME_ADMIN_SECRET })
})
