import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const ORIGINAL_FETCH = globalThis.fetch

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/sync-canvas'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seedFrame(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { seed } = await import('@/lib/store')
  const db = getDb() as any
  const tables = getTables() as any
  await db.insert(tables.frameDocuments).values({
    id, identifier: id, name: id, data: seed(), createdAt: new Date(), updatedAt: new Date(), revision: 1,
  })
}

const state = {
  v: 1 as const,
  active: null,
  pending: null,
  identify: { until: 9_999, canvasName: 'Wall', frameId: 'inst-1', label: null, marker: 1, count: 1 },
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('handlePull canvas delivery', () => {
  beforeEach(async () => {
    await freshDb()
    await seedFrame('inst-1')
  })

  it('includes serverTime and the canvas row when the revision differs', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { handlePull } = await import('@/lib/sync/server')
    await putCanvasState('inst-1', state)
    const before = Date.now()
    const outcome = await handlePull('inst-1', undefined, { cvRev: 0 })
    expect(outcome.serverTime).toBeGreaterThanOrEqual(before)
    expect(outcome.canvas?.revision).toBe(1)
    expect(outcome.canvas?.state?.identify?.marker).toBe(1)
  })

  it('omits canvas when the revision matches', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { handlePull } = await import('@/lib/sync/server')
    await putCanvasState('inst-1', state)
    const outcome = await handlePull('inst-1', undefined, { cvRev: 1 })
    expect(outcome.canvas).toBeUndefined()
    expect(typeof outcome.serverTime).toBe('number')
  })

  it('sends the clearing form when the row disappeared', async () => {
    const { handlePull } = await import('@/lib/sync/server')
    const outcome = await handlePull('inst-1', undefined, { cvRev: 5 })
    expect(outcome.canvas).toEqual({ revision: 0, state: null })
  })

  it('keeps the old call shape working', async () => {
    const { handlePull } = await import('@/lib/sync/server')
    const outcome = await handlePull('inst-1')
    expect(Array.isArray(outcome.changes)).toBe(true)
    expect(typeof outcome.serverTime).toBe('number')
  })
})

describe('pullRemote canvas apply', () => {
  beforeEach(async () => {
    await freshDb()
    const { resetClockSamples } = await import('@/lib/canvas/clock-service')
    resetClockSamples()
  })

  it('stores the canvas locally, records a clock sample and never enqueues it', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      changes: [],
      cursor: '2026-01-01T00:00:00.000Z',
      resolvedConflicts: [],
      serverTime: Date.now(),
      canvas: { revision: 3, state },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch

    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console.test', token: 't', instanceId: 'inst-2' })

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('inst-2')
    expect(row?.revision).toBe(3)
    expect(row?.data.identify?.marker).toBe(1)

    const { getPending } = await import('@/lib/sync/queue')
    expect(await getPending()).toEqual([])

    const { getCanvasClock } = await import('@/lib/canvas/clock-service')
    expect(getCanvasClock().source).toBe('console')
  })

  it('sends cvRev and the last report as query parameters', async () => {
    let seen = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input)
      return new Response(JSON.stringify({ changes: [], cursor: 'c', resolvedConflicts: [] }), { status: 200 })
    }) as typeof fetch

    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { recordDisplayReport } = await import('@/lib/canvas/reporter')
    await putCanvasState('inst-2', state)
    recordDisplayReport('inst-2', { appliedRevision: 2, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })

    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console.test', token: 't', instanceId: 'inst-2' })

    expect(seen).toContain('cvRev=1')
    expect(seen).toContain('cvApplied=2')
    expect(seen).toContain('vw=1080')
    expect(seen).toContain('vh=1920')
    expect(seen).toContain('fps=29.5')
  })
})
