import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_COOKIE, hashAdminPassword, signAdminSession } from '@/lib/frame-admin'

const env = process.env as Record<string, string | undefined>

afterEach(() => {
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
})

async function getSession(cookie?: string) {
  const { GET } = await import('@/app/api/admin/session/route')
  const headers = cookie ? { cookie } : undefined
  return GET(new Request('http://frame:8808/api/admin/session', { headers }))
}

describe('GET /api/admin/session', () => {
  it('reports an unconfigured frame without disclosing credentials', async () => {
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET

    const response = await getSession()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ configured: false, authenticated: false })
  })

  it('reports configured auth without a valid cookie', async () => {
    env.FRAME_ADMIN_HASH = hashAdminPassword('frame-password')
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)

    const response = await getSession()
    const body = await response.json()

    expect(body).toEqual({ configured: true, authenticated: false })
    expect(JSON.stringify(body)).not.toContain(env.FRAME_ADMIN_SECRET)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('recognizes the existing signed admin cookie', async () => {
    env.FRAME_ADMIN_HASH = hashAdminPassword('frame-password')
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    const token = await signAdminSession(env.FRAME_ADMIN_SECRET)

    const response = await getSession(`${ADMIN_COOKIE}=${token}`)

    expect(await response.json()).toEqual({ configured: true, authenticated: true })
  })
})
