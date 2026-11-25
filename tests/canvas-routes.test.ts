import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-routes'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('GET /api/time', () => {
  it('returns the console time with no-store', async () => {
    const { GET } = await import('@/app/api/time/route')
    const { NextRequest } = await import('next/server')
    const before = Date.now()
    const res = await GET(new NextRequest('http://localhost/api/time'))
    const body = await res.json()
    expect(body.t).toBeGreaterThanOrEqual(before)
    expect(body.t).toBeLessThanOrEqual(Date.now())
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})

describe('GET /api/canvas/state', () => {
  beforeEach(freshDb)

  it('returns an empty state and the system clock when no row exists', async () => {
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=frame-a'))
    const body = await res.json()
    expect(body).toEqual({
      revision: 0,
      state: null,
      clock: { offsetMs: 0, uncertaintyMs: 0, quality: 'poor', source: 'system', sampledAt: null },
    })
  })

  it('reads the local row for the requested frame', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-a', { v: 1, active: null, pending: null, identify: { until: 9_999, canvasName: 'Wall', frameId: 'frame-a', label: null, marker: 1, count: 1 } })
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=frame-a'))
    const body = await res.json()
    expect(body.revision).toBe(1)
    expect(body.state.identify.marker).toBe(1)
  })

  it('rejects an invalid frame id', async () => {
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=bad%20frame'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/canvas/report', () => {
  beforeEach(async () => {
    await freshDb()
    const { resetDisplayReport } = await import('@/lib/canvas/reporter')
    resetDisplayReport()
  })

  it('stores a clamped report', async () => {
    const { POST } = await import('@/app/api/canvas/report/route')
    const { NextRequest } = await import('next/server')
    const { getDisplayReport } = await import('@/lib/canvas/reporter')
    const res = await POST(new NextRequest('http://localhost/api/canvas/report?frame=frame-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedRevision: 3, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 }),
    }))
    expect(res.status).toBe(204)
    expect(getDisplayReport('frame-a')).toEqual({ appliedRevision: 3, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
  })

  it('rejects an invalid body', async () => {
    const { POST } = await import('@/app/api/canvas/report/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/report?frame=frame-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewportW: -1, evil: true }),
    }))
    expect(res.status).toBe(400)
  })
})
