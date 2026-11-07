import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const env = process.env as Record<string, string | undefined>
const origNodeEnv = process.env.NODE_ENV

afterEach(() => {
  delete env.KIOSK_MGMT_PORT
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
  delete env.ALLOW_INSECURE_LOCAL_WRITES
  if (origNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = origNodeEnv
})

function makeRequest(path: string, method = 'GET', host = 'localhost:3000') {
  return new NextRequest(`http://${host}${path}`, { method, headers: { host } })
}

describe('proxy gate wiring', () => {
  beforeAll(() => {
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'
    env.CLERK_SECRET_KEY = 'sk_test_ZmFrZS1jbGVyay1zZWNyZXQta2V5'
  })

  afterAll(() => {
    delete env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    delete env.CLERK_SECRET_KEY
  })

  it('proxy.ts module loads and exports a handler plus matcher config', async () => {
    const mod = await import('@/proxy')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
    expect(mod.config).toBeDefined()
    expect(Array.isArray(mod.config.matcher)).toBe(true)
  })

  it('forged management-port POST triggers admin_required before Clerk', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    delete env.FRAME_ADMIN_HASH
    const mod = await import('@/proxy')
    const req = makeRequest('/api/frames', 'POST', 'x:8808')
    const res = await mod.default(req, {} as any)
    expect(res).toBeDefined()
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toBe('admin_password_not_configured')
    expect(body.hint).toContain('kiosk-ctl password')
    delete env.KIOSK_MGMT_PORT
  })

  it('returns the password hint when the hash is set but the secret is unusable', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.FRAME_ADMIN_HASH = 'configured'
    env.FRAME_ADMIN_SECRET = 'short'
    const mod = await import('@/proxy')
    const res = await mod.default(makeRequest('/api/frames', 'POST', 'x:8808'), {} as any)
    expect(res).toBeDefined()
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toBe('admin_password_not_configured')
    expect(body.hint).toContain('kiosk-ctl password')
  })

  it('display-port GET /api/store is allowed past the gate', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    const mod = await import('@/proxy')
    const req = makeRequest('/api/store', 'GET', '127.0.0.1:3000')
    const res = await mod.default(req, {} as any)
    expect(res).toBeDefined()
    // The gate would 404 this if it fired; anything else means the request fell
    // through to the Clerk stage / downstream handler.
    expect(res!.status).not.toBe(404)
    if (res!.status === 404) {
      const body = await res!.json()
      expect(body.error).not.toBe('not_found')
    }
  })

  it('management-port GET / is allowed past the gate', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    const mod = await import('@/proxy')
    const req = makeRequest('/', 'GET', 'x:8808')
    const res = await mod.default(req, {} as any)
    expect(res).toBeDefined()
    expect(res!.status).not.toBe(404)
    if (res!.status === 404) {
      const body = await res!.json()
      expect(body.error).not.toBe('not_found')
    }
  })

  it('loopback mgmt POST bypasses when no admin configured (dev)', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    const mod = await import('@/proxy')
    const res = await mod.default(makeRequest('/api/layouts', 'POST', '127.0.0.1:8808'), {} as any)
    expect(res).toBeDefined()
    // Bypass means the gate does not return the admin 401; the request
    // falls through to the Clerk stage / downstream handler.
    if (res!.status === 401) {
      const body = await res!.json()
      expect(body.error).not.toBe('admin_password_not_configured')
    } else {
      expect(res!.status).not.toBe(401)
    }
  })

  it('LAN mgmt POST still returns admin_password_not_configured when no admin configured (dev)', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    const mod = await import('@/proxy')
    const res = await mod.default(makeRequest('/api/layouts', 'POST', '192.168.1.10:8808'), {} as any)
    expect(res).toBeDefined()
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toBe('admin_password_not_configured')
  })

  it('partial admin config still returns admin_password_not_configured on loopback (dev)', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    env.FRAME_ADMIN_HASH = 'configured'
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    const mod = await import('@/proxy')
    const res = await mod.default(makeRequest('/api/layouts', 'POST', '127.0.0.1:8808'), {} as any)
    expect(res).toBeDefined()
    expect(res!.status).toBe(401)
    const body = await res!.json()
    expect(body.error).toBe('admin_password_not_configured')
  })

  it('ALLOW_INSECURE_LOCAL_WRITES=1 allows LAN mgmt POST when no admin configured', async () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'production'
    env.ALLOW_INSECURE_LOCAL_WRITES = '1'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    const mod = await import('@/proxy')
    const res = await mod.default(makeRequest('/api/layouts', 'POST', '192.168.1.10:8808'), {} as any)
    expect(res).toBeDefined()
    if (res!.status === 401) {
      const body = await res!.json()
      expect(body.error).not.toBe('admin_password_not_configured')
    } else {
      expect(res!.status).not.toBe(401)
    }
  })
})
