import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-demo'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('canvas demo route', () => {
  beforeEach(freshDb)

  it('creates a deployment with scenes and an identify overlay', async () => {
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a&slot=a&identify=1', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revision).toBe(1)

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('frame-a')
    expect(row?.data.active?.canvasId).toBe('demo-wall')
    expect(row?.data.active?.slotId).toBe('a')
    expect(row?.data.active?.album?.scenes).toHaveLength(4)
    expect(row?.data.identify?.frameId).toBe('frame-a')
    expect(row?.data.identify?.label).toBe('Left')
    expect(row?.data.identify?.marker).toBe(1)
  })

  it('shares one timeline and scene identity across both slots', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-25T18:00:00.000Z'))
      const { POST } = await import('@/app/api/canvas/demo/route')
      const { NextRequest } = await import('next/server')
      await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a&slot=a', { method: 'POST' }))
      vi.setSystemTime(new Date('2026-11-25T18:00:05.000Z'))
      await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-b&slot=b', { method: 'POST' }))

      const { getCanvasState } = await import('@/lib/canvas/state-store')
      const a = (await getCanvasState('frame-a'))?.data.active
      const b = (await getCanvasState('frame-b'))?.data.active
      expect(a?.slotId).toBe('a')
      expect(b?.slotId).toBe('b')
      expect(a?.effectiveAt).toBe(b?.effectiveAt)
      expect(a?.releaseAt).toBe(b?.releaseAt)
      expect(a?.config).toEqual(b?.config)
      expect(a?.album?.scenes.map((scene) => [scene.id, scene.seed])).toEqual(
        b?.album?.scenes.map((scene) => [scene.id, scene.seed]),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('defaults to the first slot without identify', async () => {
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('frame-a')
    expect(row?.data.active?.slotId).toBe('a')
    expect(row?.data.identify).toBeNull()
  })

  it('deletes the row', async () => {
    const { POST, DELETE } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    const res = await DELETE(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'DELETE' }))
    expect(res.status).toBe(204)
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    expect(await getCanvasState('frame-a')).toBeNull()
  })

  it('is hidden in production without the opt-in flag', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete env.CANVAS_DEMO
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    expect(res.status).toBe(404)
  })
})
