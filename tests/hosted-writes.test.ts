import { describe, it, expect, afterEach } from 'vitest'

// Final review I-6: the SAME app doubles as the hosted console (postgres
// mode). Editor write APIs must not be world-writable there; on a local
// kiosk (sqlite) they stay open for the LAN device.
const env = process.env as Record<string, string | undefined>

afterEach(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.NODE_ENV
  delete env.CONSOLE_ADMIN_TOKEN
})

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  return new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}

describe('hosted console write gate', () => {
  it('POST /api/layouts is 401 unauthenticated in console mode', async () => {
    env.FRAME_MODE = 'console'
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'h-admin'
    const { POST } = await import('@/app/api/layouts/route')
    const res = await POST(await post('http://x/api/layouts', { name: 'L' }))
    expect(res.status).toBe(401)
  })

  it('PUT /api/active is 401 unauthenticated in console mode', async () => {
    env.FRAME_MODE = 'console'
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'h-admin'
    const { PUT } = await import('@/app/api/active/route')
    const res = await PUT(await post('http://x/api/active', { layoutId: 'l1' }), )
    expect(res.status).toBe(401)
  })

  it('POST /api/frames is refused with a bogus admin token in console mode', async () => {
    env.FRAME_MODE = 'console'
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'h-admin'
    const { POST } = await import('@/app/api/frames/route')
    const res = await POST(await post('http://x/api/frames', { id: 'x', name: 'X' }, { 'x-admin-token': 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('kiosk (sqlite) mode is unaffected: unauthenticated writes still work', async () => {
    delete env.FRAME_MODE
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/hosted-adata'
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { resetStoreCache } = await import('@/lib/store')
    resetStoreCache()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { POST } = await import('@/app/api/layouts/route')
    const res = await POST(await post('http://x/api/layouts?frame=home', { name: 'L', settings: {}, widgets: [] }))
    expect(res.status).not.toBe(401)
  })
})
