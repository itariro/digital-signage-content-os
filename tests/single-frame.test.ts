import { describe, it, expect, beforeAll, afterEach } from 'vitest'

// Single-frame kiosk enforcement (user design resolution): a provisioned
// instance (INSTANCE_ID set) may only manage 'home' — extra frames are
// onboarded as their own instances. Unprovisioned local dev keeps multi-frame.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/single-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function jsonReq(url: string, method: string, body?: unknown) {
  const { NextRequest } = await import('next/server')
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

afterEach(() => { delete env.INSTANCE_ID })

describe('provisioned instance is single-frame', () => {
  it('POST /api/frames refuses a second frame when INSTANCE_ID is set', async () => {
    env.INSTANCE_ID = 'p-1'
    await freshDb()
    const { POST } = await import('@/app/api/frames/route')
    const res = await POST(await jsonReq('http://x/api/frames', 'POST', { id: 'kitchen', name: 'Kitchen' }))
    expect(res.status).toBe(400)
  })

  it('PATCH /api/frames refuses a non-home frame when INSTANCE_ID is set', async () => {
    env.INSTANCE_ID = 'p-1'
    await freshDb()
    const { PATCH } = await import('@/app/api/frames/route')
    const res = await PATCH(await jsonReq('http://x/api/frames', 'PATCH', { id: 'kitchen', name: 'x' }))
    expect(res.status).toBe(400)
  })

  it('DELETE /api/frames refuses extra frames when INSTANCE_ID is set', async () => {
    env.INSTANCE_ID = 'p-1'
    await freshDb()
    const { DELETE } = await import('@/app/api/frames/route')
    const { NextRequest } = await import('next/server')
    const res = await DELETE(new NextRequest('http://x/api/frames?id=kitchen', { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })

  it('without INSTANCE_ID (local dev) frame creation still works', async () => {
    delete env.INSTANCE_ID
    await freshDb()
    const { POST } = await import('@/app/api/frames/route')
    const res = await POST(await jsonReq('http://x/api/frames', 'POST', { id: 'kitchen', name: 'Kitchen' }))
    expect(res.status).toBe(201)
  })
})
