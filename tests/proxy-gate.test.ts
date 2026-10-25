import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

const env = process.env as Record<string, string | undefined>

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
})
