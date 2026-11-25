import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { nanoid } from 'nanoid'

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
      frame: null,
      frames: [],
    })
  })

  it('returns enrolled frame screen dimensions', async () => {
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()
    await db.insert(tables.frameDocuments).values({
      id: nanoid(10),
      identifier: 'frame-a',
      name: 'Frame A',
      data: { activeId: null, layouts: [], presets: [], customFonts: [], schedule: { enabled: false, rules: [], night: { enabled: false } }, albums: [], experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } } },
      screenWidthMm: 344,
      screenHeightMm: 193,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=frame-a'))
    const body = await res.json()
    expect(body.frame).toEqual({ id: 'frame-a', screenWidthMm: 344, screenHeightMm: 193 })
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

describe('canvas management API routes', () => {
  beforeAll(() => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'canvas-api-admin'
  })

  afterEach(() => {
    delete env.INSTANCE_ID
  })

  async function freshManageDb() {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { resetStoreCache } = await import('@/lib/store')
    resetStoreCache()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
  }

  async function seed() {
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { ensureCanvasLibrary, CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
    const { defaultSlideshow } = await import('@/lib/albums')
    const { emptySyncTestScene } = await import('@/lib/canvas/defaults')
    const store = await ensureCanvasLibrary()
    const now = new Date().toISOString()
    const albumId = nanoid(8)
    const layoutId = nanoid(8)
    const db = getDb()
    const tables = getTables()
    const ids = Array.from({ length: 16 }, (_, index) => `f${index}`)

    for (const id of ids) {
      await db.insert(tables.instances).values({ id, createdAt: new Date(), lastSeenAt: new Date() })
      await db.insert(tables.frameDocuments).values({
        id: nanoid(10), identifier: id, name: `Frame ${id}`,
        data: { activeId: null, layouts: [], presets: [], customFonts: [], schedule: { enabled: false, rules: [], night: { enabled: false } }, albums: [], experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } } },
        createdAt: new Date(), updatedAt: new Date(),
      })
    }

    store.albums.push({
      id: albumId, name: 'Canvas album', theme: 'canvas', items: [],
      scenes: [emptySyncTestScene(nanoid(8))], slideshow: defaultSlideshow('canvas'),
      createdAt: now, updatedAt: now,
    })
    store.layouts.push({
      id: layoutId, name: 'Wall', kind: 'canvas', widgets: [],
      settings: {
        resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0,
        units: 'metric', snap: true, gridSize: 20, albumId,
      },
      canvas: {
        arrangement: 'row', gap: 0, align: 'center',
        slots: [
          { id: 's1', frameId: 'f0', offset: { x: 0, y: 0 }, scale: 1 },
          { id: 's2', frameId: 'f1', offset: { x: 0, y: 0 }, scale: 1 },
        ],
        background: '#000000', markers: 'identify', notifications: 'suppress',
        nightMode: 'inherit', maxFps: 30,
      },
      createdAt: now, updatedAt: now,
    })
    await db.update(tables.frameDocuments).set({ data: store })
      .where(eq(tables.frameDocuments.identifier, CANVAS_LIBRARY_ID))
    return { layoutId, albumId, ids }
  }

  async function post(path: string, body: unknown) {
    return new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'canvas-api-admin' },
      body: JSON.stringify(body),
    })
  }

  async function mutateLibrary(fn: (store: any) => void) {
    const { mutateStore } = await import('@/lib/store')
    await mutateStore(fn, 'canvas-library')
  }

  beforeEach(freshManageDb)

  it('deploys a canvas and reports the palette with inCanvas state', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    const response = await POST(await post('/api/canvas/deploy', { layoutId, leadMs: 1000 }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.leadMs).toBe(65_000)
    expect(json.members).toHaveLength(2)

    const { GET } = await import('@/app/api/canvas/library/route')
    const library = await GET(new NextRequest('http://localhost/api/canvas/library', {
      headers: { 'x-admin-token': 'canvas-api-admin' },
    }))
    expect(library.status).toBe(200)
    const payload = await library.json()
    expect(payload.frames).toHaveLength(16)
    expect(payload.frames.find((frame: { id: string }) => frame.id === 'f0').inCanvas).toEqual({
      canvasId: layoutId,
      name: 'Wall',
      state: 'scheduled',
    })
  })

  it('rejects unknown request keys with 400', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    const response = await POST(await post('/api/canvas/deploy', { layoutId, evil: true }))
    expect(response.status).toBe(400)
  })

  it('returns 403 from every management route on a kiosk', async () => {
    const { layoutId } = await seed()
    env.INSTANCE_ID = 'kiosk-1'
    const modules = await Promise.all([
      import('@/app/api/canvas/deploy/route'),
      import('@/app/api/canvas/release/route'),
      import('@/app/api/canvas/identify/route'),
    ])
    for (const module of modules) {
      const response = await module.POST(await post('/api/canvas/manage', { layoutId, seconds: 5 }))
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('E_CONSOLE_ONLY')
    }
  })

  it('reaches every deployment validation code', async () => {
    const { layoutId, albumId, ids } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')

    await mutateLibrary((s) => { s.layouts[0].canvas.slots = [] })
    expect((await POST(await post('/api/canvas/deploy', { layoutId }))).status).toBe(422)
    expect((await (await POST(await post('/api/canvas/deploy', { layoutId }))).json()).code).toBe('E_NO_SLOTS')

    await freshManageDb()
    const next = await seed()
    await mutateLibrary((s) => { s.layouts[0].canvas.slots[0].frameId = null })
    let res = await POST(await post('/api/canvas/deploy', { layoutId: next.layoutId }))
    expect((await res.json()).code).toBe('E_UNASSIGNED_SLOT')

    await freshManageDb()
    const unknown = await seed()
    await mutateLibrary((s) => { s.layouts[0].canvas.slots[0].frameId = 'ghost' })
    res = await POST(await post('/api/canvas/deploy', { layoutId: unknown.layoutId }))
    expect((await res.json()).code).toBe('E_UNKNOWN_FRAME')

    await freshManageDb()
    const noAlbum = await seed()
    await mutateLibrary((s) => { s.layouts[0].settings.albumId = null })
    res = await POST(await post('/api/canvas/deploy', { layoutId: noAlbum.layoutId }))
    expect((await res.json()).code).toBe('E_NO_ALBUM')

    await freshManageDb()
    const noScenes = await seed()
    await mutateLibrary((s) => { s.albums[0].scenes = [] })
    res = await POST(await post('/api/canvas/deploy', { layoutId: noScenes.layoutId }))
    expect((await res.json()).code).toBe('E_NO_SCENES')

    await freshManageDb()
    const overlap = await seed()
    await mutateLibrary((s) => {
      s.layouts[0].canvas.slots[1].offset.x = -1000
    })
    res = await POST(await post('/api/canvas/deploy', { layoutId: overlap.layoutId }))
    expect((await res.json()).code).toBe('E_OVERLAP')

    await freshManageDb()
    const tooLarge = await seed()
    await mutateLibrary((s) => {
      s.layouts[0].canvas.slots = ids.map((frameId, index) => ({
        id: `s${index}`, frameId, offset: { x: 0, y: 0 }, scale: 2,
      }))
    })
    res = await POST(await post('/api/canvas/deploy', { layoutId: tooLarge.layoutId }))
    expect((await res.json()).code).toBe('E_TOO_LARGE')

    await freshManageDb()
    const invalidScene = await seed()
    await mutateLibrary((s) => { s.albums[0].scenes[0].durationSec = 1 })
    res = await POST(await post('/api/canvas/deploy', { layoutId: invalidScene.layoutId }))
    expect((await res.json()).code).toBe('E_SCENE_INVALID')
    expect(albumId).toBeTruthy()
  })

  it('returns 409 for a frame on another scheduled canvas', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    await POST(await post('/api/canvas/deploy', { layoutId }))
    await mutateLibrary((s) => {
      s.layouts.push({ ...structuredClone(s.layouts[0]), id: 'other-wall', name: 'Other wall' })
    })
    const res = await POST(await post('/api/canvas/deploy', { layoutId: 'other-wall' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('E_FRAME_IN_USE')
  })

  it('refuses to delete a scheduled or live canvas layout with E_LIVE', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    await POST(await post('/api/canvas/deploy', { layoutId }))
    const { DELETE } = await import('@/app/api/layouts/[id]/route')
    const res = await DELETE(new Request(`http://localhost/api/layouts/${layoutId}?frame=canvas-library`, {
      method: 'DELETE',
      headers: { 'x-admin-token': 'canvas-api-admin' },
    }), { params: Promise.resolve({ id: layoutId }) })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('E_LIVE')
  })

  it('releases a live canvas and clears draft identification', async () => {
    const { layoutId } = await seed()
    const deploy = await import('@/app/api/canvas/deploy/route')
    const release = await import('@/app/api/canvas/release/route')
    const identify = await import('@/app/api/canvas/identify/route')

    await deploy.POST(await post('/api/canvas/deploy', { layoutId }))
    const released = await release.POST(await post('/api/canvas/release', { layoutId }))
    expect(released.status).toBe(200)
    const releaseJson = await released.json()
    expect(releaseJson.releaseAt).toBeGreaterThan(Date.now())

    const identified = await identify.POST(await post('/api/canvas/identify', { layoutId, seconds: 20 }))
    expect(identified.status).toBe(200)
    const cleared = await identify.POST(await post('/api/canvas/identify', { layoutId, seconds: 0 }))
    expect((await cleared.json()).until).toBeNull()
  })
})
