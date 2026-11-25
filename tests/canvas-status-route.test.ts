import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasScene, Layout } from '@/lib/types'

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = process.env.NODE_ENV

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-status-route'
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = originalNodeEnv
  delete env.CONSOLE_ADMIN_TOKEN
  delete env.INSTANCE_ID
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  const { ensureCanvasLibrary } = await import('@/lib/canvas/library')
  await ensureCanvasLibrary()
}

async function seedInstance(id: string, name: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { seed } = await import('@/lib/store')
  const db = getDb()
  const tables = getTables()
  const now = new Date()
  await db.insert(tables.frameDocuments).values({
    id,
    identifier: id,
    name,
    data: seed(),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  })
  await db.insert(tables.instances).values({ id, createdAt: now, lastSeenAt: now })
}

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'slot-a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const scene: CanvasScene = {
  id: 'scene-1',
  name: 'Check alignment',
  enabled: true,
  durationSec: 30,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
}

async function seedStatus(options: { includeInstance?: boolean } = {}) {
  const includeInstance = options.includeInstance ?? true
  const { CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
  const { mutateStore } = await import('@/lib/store')
  const { defaultSlideshow } = await import('@/lib/albums')
  const { putCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
  const createdAt = '2026-01-01T00:00:00.000Z'
  const now = Date.now()

  const layout: Layout = {
    id: 'wall-1',
    name: 'Entrance wall',
    kind: 'canvas',
    canvas: config,
    widgets: [],
    settings: {
      resolution: '1080x1920',
      background: '',
      dim: 0,
      locationName: '',
      lat: 0,
      lon: 0,
      units: 'metric',
      snap: true,
      gridSize: 20,
      albumId: 'album-1',
    },
    createdAt,
    updatedAt: createdAt,
  }

  const album = {
    id: 'album-1',
    name: 'Entrance album',
    theme: 'canvas' as const,
    items: [],
    scenes: [scene],
    slideshow: { ...defaultSlideshow('canvas'), canvas: { crossfadeMs: 400 } },
    createdAt,
    updatedAt: createdAt,
  }

  await mutateStore((store) => {
    store.layouts.push(layout)
    store.albums.push(album)
  }, CANVAS_LIBRARY_ID)

  if (includeInstance) await seedInstance('frame-a', 'Frame A')

  const deployment: CanvasDeployment = {
    canvasId: layout.id,
    name: layout.name,
    revision: 1,
    effectiveAt: now - 1000,
    releaseAt: null,
    slotId: 'slot-a',
    config,
    album: {
      id: album.id,
      name: album.name,
      scenes: [scene],
      order: album.slideshow.order,
      crossfadeMs: 400,
    },
  }

  await putCanvasState('frame-a', { v: 1, active: deployment, pending: null, identify: null })
  await recordCanvasReport('frame-a', {
    appliedRevision: 1,
    clockOffsetMs: 8,
    clockUncertaintyMs: 6,
    viewportW: 1080,
    viewportH: 1920,
    fpsAvg: 29.5,
  }, now)

  return { layout, album, deployment, now }
}

async function getStatus(query = '', token = 'status-admin', headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  const { GET } = await import('@/app/api/canvas/status/route')
  const request = new NextRequest(`http://localhost/api/canvas/status${query}`, {
    headers: { 'x-admin-token': token, ...headers },
  })
  return GET(request)
}

describe('GET /api/canvas/status', () => {
  beforeEach(async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'status-admin'
    delete env.INSTANCE_ID
    await freshDb()
  })

  it('returns health fields for an authorized operator', async () => {
    const seeded = await seedStatus()
    const response = await getStatus('?layoutId=wall-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.pollMs).toBe(5000)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]).toMatchObject({
      canvasId: 'wall-1',
      canvasName: 'Entrance wall',
      slotId: 'slot-a',
      marker: 1,
      frameId: 'frame-a',
      frameName: 'Frame A',
      frameExists: true,
      revision: 1,
      deploymentRevision: 1,
      reportedRevision: 1,
      reportedAtMs: seeded.now,
      clockQuality: 'good',
      unpublishedChanges: false,
    })
  })

  it('rejects a missing or wrong operator token', async () => {
    await seedStatus()
    expect((await getStatus('', '')).status).toBe(401)
    expect((await getStatus('', 'wrong')).status).toBe(401)
  })

  it('refuses to run on a kiosk instance', async () => {
    await seedStatus()
    env.INSTANCE_ID = 'frame-a'
    const response = await getStatus()
    expect(response.status).toBe(403)
  })

  it('rejects an invalid layoutId query', async () => {
    await seedStatus()
    const response = await getStatus('?layoutId=../wall')
    expect(response.status).toBe(400)
  })

  it('sets unpublishedChanges after a library edit', async () => {
    await seedStatus()
    const { CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((store) => {
      const layout = store.layouts.find((value) => value.id === 'wall-1')
      if (layout?.canvas) layout.canvas = { ...layout.canvas, gap: 240 }
    }, CANVAS_LIBRARY_ID)

    const response = await getStatus('?layoutId=wall-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0].unpublishedChanges).toBe(true)
  })

  it('reports stale and poor clock fields for a struggling member', async () => {
    const seeded = await seedStatus()
    const { recordCanvasReport } = await import('@/lib/canvas/state-store')
    await recordCanvasReport('frame-a', {
      appliedRevision: 0,
      clockOffsetMs: 120,
      clockUncertaintyMs: 80,
      viewportW: 1080,
      viewportH: 1950,
      fpsAvg: 4,
    }, seeded.now + 20_000)

    const response = await getStatus()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0]).toMatchObject({
      revision: 1,
      reportedRevision: 0,
      reportedAtMs: seeded.now + 20_000,
      clockQuality: 'poor',
      viewportH: 1950,
      fpsAvg: 4,
    })
  })

  it('shows a missing frame after its instance is removed', async () => {
    await seedStatus({ includeInstance: false })
    const response = await getStatus()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0]).toMatchObject({
      frameId: 'frame-a',
      frameExists: false,
      revision: 1,
      reportedRevision: 1,
    })
  })
})
