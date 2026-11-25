import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { deployCanvas, getCanvasStatus, identifyCanvas, releaseCanvas } from '@/lib/canvas/service'

// Static imports evaluate before beforeAll; the DB path must be set first.
vi.hoisted(() => {
  const env = process.env as Record<string, string | undefined>
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-service'
})

async function freshDb() {
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
  const { ensureCanvasLibrary } = await import('@/lib/canvas/library')
  const { defaultSlideshow } = await import('@/lib/albums')
  const { emptySyncTestScene } = await import('@/lib/canvas/defaults')
  const store = await ensureCanvasLibrary()
  const now = new Date().toISOString()
  const albumId = nanoid(8)
  const layoutId = nanoid(8)
  const db = getDb()
  const tables = getTables()

  for (const id of ['fa', 'fb', 'fc']) {
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
    id: layoutId, name: 'Three frame wall', kind: 'canvas', widgets: [],
    settings: { ...store.layouts[0]?.settings ?? {
      resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0,
      units: 'metric', snap: true, gridSize: 20, albumId,
    }, albumId },
    canvas: {
      arrangement: 'row', gap: 0, align: 'center',
      slots: [
        { id: 's1', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 's2', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 's3', frameId: 'fc', offset: { x: 0, y: 0 }, scale: 1 },
      ],
      background: '#000000', markers: 'identify', notifications: 'suppress',
      nightMode: 'inherit', maxFps: 30,
    },
    createdAt: now, updatedAt: now,
  })
  await db.update(tables.frameDocuments).set({ data: store }).where(eq(tables.frameDocuments.identifier, 'canvas-library'))
  return { store, layoutId, albumId }
}

describe('deployCanvas', () => {
  beforeEach(freshDb)

  it('writes pending state to every member and audits the deployment', async () => {
    const { layoutId } = await seed()
    const result = await deployCanvas({ layoutId, actor: 'operator', leadMs: 15_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.revision).toBe(1)
    expect(result.leadMs).toBe(65_000)
    expect(result.members.map((m) => m.marker)).toEqual([1, 2, 3])

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('fa')
    expect(row?.revision).toBe(1)
    expect(row?.data.pending?.canvasId).toBe(layoutId)
    expect(row?.data.active).toBeNull()

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const logs = await getDb().select().from(getTables().auditLog)
    expect(logs.some((log) => log.action === 'canvas_deploy')).toBe(true)
  })

  it('keeps deployment revisions climbing after state rows are pruned', async () => {
    const { layoutId } = await seed()
    const first = await deployCanvas({ layoutId, actor: 'op' })
    if (!first.ok) throw new Error(first.error)
    const { deleteCanvasState } = await import('@/lib/canvas/state-store')
    for (const id of ['fa', 'fb', 'fc']) await deleteCanvasState(id)
    const second = await deployCanvas({ layoutId, actor: 'op' })
    expect(second.ok && second.revision).toBe(2)
  })

  it('reports unassigned slots by slot id rather than frame id', async () => {
    const { store, layoutId } = await seed()
    const config = store.layouts.find((entry) => entry.id === layoutId)?.canvas
    if (!config) throw new Error('missing canvas config')
    config.slots[1].frameId = null
    const result = await identifyCanvas({ layoutId, seconds: 10, actor: 'op' })
    expect(result.ok && result.skipped).toEqual([{ frameId: null, slotId: 's2', reason: 'unassigned' }])
  })

  it('serialises concurrent deployments so revisions are unique', async () => {
    const { layoutId } = await seed()
    const results = await Promise.all([
      deployCanvas({ layoutId, actor: 'op' }),
      deployCanvas({ layoutId, actor: 'op' }),
    ])
    const revisions = results.map((result) => result.ok ? result.revision : -1).sort()
    expect(revisions).toEqual([1, 2])
  })

  it('keeps active state on update and releases removed members', async () => {
    const { layoutId } = await seed()
    const first = await deployCanvas({ layoutId, actor: 'operator' })
    if (!first.ok) throw new Error(first.error)
    // Simulate the kiosk acknowledgement: the console never promotes pending
    // to active by itself, so the test writes the active deployment directly.
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    for (const id of ['fa', 'fb', 'fc']) {
      const row = await getCanvasState(id)
      if (!row?.data.pending) continue
      await putCanvasState(id, { ...row.data, active: row.data.pending, pending: null })
    }
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => {
      const layout = s.layouts.find((l) => l.id === layoutId)
      if (layout?.canvas) layout.canvas.slots = layout.canvas.slots.filter((slot) => slot.frameId !== 'fc')
    }, 'canvas-library')
    const result = await deployCanvas({ layoutId, actor: 'operator' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const kept = await getCanvasState('fa')
    const removed = await getCanvasState('fc')
    expect(kept?.data.active?.canvasId).toBe(layoutId)
    expect(kept?.data.pending?.revision).toBe(2)
    expect(removed?.data.active?.releaseAt).toBe(result.effectiveAt)
    expect(removed?.data.pending).toBeNull()
  })

  it('returns every documented validation code', async () => {
    const { layoutId } = await seed()
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.layouts.find((l) => l.id === layoutId)!.canvas!.slots = [] }, 'canvas-library')
    expect((await deployCanvas({ layoutId, actor: 'op' })).ok).toBe(false)

    await freshDb()
    const second = await seed()
    await mutateStore((s) => {
      s.layouts.find((l) => l.id === second.layoutId)!.canvas!.slots[0].frameId = null
    }, 'canvas-library')
    const unassigned = await deployCanvas({ layoutId: second.layoutId, actor: 'op' })
    expect(unassigned.ok).toBe(false)
    if (!unassigned.ok) expect(unassigned.code).toBe('E_UNASSIGNED_SLOT')

    await freshDb()
    const third = await seed()
    await mutateStore((s) => {
      s.layouts.find((l) => l.id === third.layoutId)!.canvas!.slots[0].frameId = 'ghost'
    }, 'canvas-library')
    const unknown = await deployCanvas({ layoutId: third.layoutId, actor: 'op' })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.code).toBe('E_UNKNOWN_FRAME')
  })

  it('refuses a frame already on another scheduled canvas', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    const { mutateStore } = await import('@/lib/store')
    const otherId = nanoid(8)
    await mutateStore((s) => {
      const base = s.layouts.find((l) => l.id === layoutId)!
      s.layouts.push({ ...structuredClone(base), id: otherId, name: 'Other', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      s.layouts.find((l) => l.id === layoutId)!.settings.albumId = null
    }, 'canvas-library')
    const conflict = await deployCanvas({ layoutId: otherId, actor: 'op' })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.code).toBe('E_FRAME_IN_USE')
      expect(conflict.details?.frameId).toBe('fa')
    }
  })
})

describe('releaseCanvas and identifyCanvas', () => {
  beforeEach(freshDb)

  it('releases every active member and clears pending', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    // Simulate the kiosk acknowledgement: releaseCanvas only stamps an existing
    // active deployment, so promote each pending row before releasing.
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    for (const id of ['fa', 'fb', 'fc']) {
      const row = await getCanvasState(id)
      if (!row?.data.pending) continue
      await putCanvasState(id, { ...row.data, active: row.data.pending, pending: null })
    }
    const released = await releaseCanvas({ layoutId, actor: 'op' })
    expect(released.ok).toBe(true)
    if (!released.ok) throw new Error(released.error)
    const row = await getCanvasState('fa')
    expect(row?.data.active?.releaseAt).toBe(released.releaseAt)
    expect(row?.data.pending).toBeNull()
  })

  it('identifies a draft canvas and clears identification with zero seconds', async () => {
    const { layoutId } = await seed()
    const started = await identifyCanvas({ layoutId, seconds: 10, actor: 'op' })
    expect(started.ok).toBe(true)
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    expect((await getCanvasState('fa'))?.data.identify?.marker).toBe(1)
    const cleared = await identifyCanvas({ layoutId, seconds: 0, actor: 'op' })
    expect(cleared.ok).toBe(true)
    expect((await getCanvasState('fa'))?.data.identify).toBeNull()
  })
})

describe('getCanvasStatus', () => {
  beforeEach(freshDb)

  it('reports flat status rows with per-slot problems', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    const status = await getCanvasStatus({ layoutId })
    expect(status).toHaveLength(3)
    expect(status[0]).toMatchObject({
      canvasId: layoutId,
      slotId: 's1',
      frameId: 'fa',
      state: 'scheduled',
      reportedAtMs: null,
      revision: 1,
      deploymentRevision: 1,
    })
    const { canvasProblems, STATUS_POLL_MS } = await import('@/lib/canvas/problems')
    expect(canvasProblems(status[0], Date.now(), STATUS_POLL_MS)).toContain('No report yet')
  })

  it('does not mark a just deployed canvas unpublished with disabled scenes', async () => {
    const { store, layoutId } = await seed()
    const album = store.albums[0]
    if (!album) throw new Error('missing canvas album')
    const { emptySyncTestScene } = await import('@/lib/canvas/defaults')
    album.scenes = [...(album.scenes ?? []), { ...emptySyncTestScene(nanoid(8)), enabled: false }]
    album.slideshow.canvas = undefined

    const deployed = await deployCanvas({ layoutId, actor: 'op' })
    expect(deployed.ok).toBe(true)

    const status = await getCanvasStatus({ layoutId })
    expect(status).toHaveLength(3)
    expect(status.every((entry) => entry.unpublishedChanges === false)).toBe(true)
  })
})
