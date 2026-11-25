import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-state-store'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

const state = { v: 1 as const, active: null, pending: null, identify: null }

describe('canvas state store', () => {
  it('creates, bumps and reads a row', async () => {
    await freshDb()
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    expect(await getCanvasState('frame-a')).toBeNull()
    const first = await putCanvasState('frame-a', state)
    expect(first).toBe(1)
    const second = await putCanvasState('frame-a', { ...state, identify: { until: 1, canvasName: 'c', frameId: 'f', label: null, marker: 1, count: 1 } })
    expect(second).toBe(2)
    const row = await getCanvasState('frame-a')
    expect(row?.revision).toBe(2)
    expect(row?.data.identify?.marker).toBe(1)
  })

  it('applies a remote revision exactly and clears on revision 0', async () => {
    await freshDb()
    const { applyRemoteCanvasState, getCanvasState } = await import('@/lib/canvas/state-store')
    await applyRemoteCanvasState('frame-a', 7, state)
    expect((await getCanvasState('frame-a'))?.revision).toBe(7)
    await applyRemoteCanvasState('frame-a', 0, null)
    expect(await getCanvasState('frame-a')).toBeNull()
  })

  it('keeps revisions increasing after a row is deleted', async () => {
    await freshDb()
    const { putCanvasState, applyRemoteCanvasState, deleteCanvasState, getCanvasState } = await import('@/lib/canvas/state-store')
    expect(await putCanvasState('frame-a', state)).toBe(1)
    await deleteCanvasState('frame-a')
    expect(await putCanvasState('frame-a', state)).toBe(2)
    await applyRemoteCanvasState('frame-a', 7, state)
    await deleteCanvasState('frame-a')
    expect(await putCanvasState('frame-a', state)).toBe(8)
    await applyRemoteCanvasState('frame-a', 3, state)
    expect(await putCanvasState('frame-a', state)).toBe(9)
    expect((await getCanvasState('frame-a'))?.revision).toBe(9)
  })

  it('does not delete a row replaced after pruning listed it', async () => {
    await freshDb()
    const { getCanvasState, putCanvasState, pruneCanvasState } = await import('@/lib/canvas/state-store')
    const expired = {
      ...state,
      active: {
        canvasId: 'wall', name: 'Wall', revision: 1, effectiveAt: 0, releaseAt: 1,
        slotId: 'a', config: { arrangement: 'row' as const, gap: 0, align: 'center' as const, slots: [{ id: 'a', frameId: null, offset: { x: 0, y: 0 }, scale: 1 }], background: '#000000', markers: 'identify' as const, notifications: 'suppress' as const, nightMode: 'inherit' as const, maxFps: 30 as const }, album: null,
      },
    }
    await putCanvasState('frame-a', expired)
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()
    await db.update(tables.canvasState).set({ revision: 2 }).where(eq(tables.canvasState.instanceId, 'frame-a'))

    const removed = await pruneCanvasState(Date.now(), async () => [{
      instanceId: 'frame-a', revision: 1, data: expired, updatedAt: new Date(),
      reportedRevision: null, clockOffsetMs: null, clockUncertaintyMs: null,
      viewportW: null, viewportH: null, fpsAvg: null, reportedAt: null,
    }])
    expect(removed).toBe(1)
    expect((await getCanvasState('frame-a'))?.revision).toBe(2)
  })

  it('records a report once and throttles repeats', async () => {
    await freshDb()
    const { getCanvasState, putCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-a', state)
    const now = 1_000_000
    await recordCanvasReport('frame-a', { appliedRevision: 1, clockOffsetMs: 12, clockUncertaintyMs: 6, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 }, now)
    let row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(1)
    expect(row?.clockOffsetMs).toBe(12)
    expect(row?.reportedAt?.getTime()).toBe(now)
    await recordCanvasReport('frame-a', { appliedRevision: 9, clockOffsetMs: 99, clockUncertaintyMs: 1, viewportW: 1, viewportH: 1, fpsAvg: 1 }, now + 5_000)
    row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(1)
    await recordCanvasReport('frame-a', { appliedRevision: 9, clockOffsetMs: 99, clockUncertaintyMs: 1, viewportW: 1, viewportH: 1, fpsAvg: 1 }, now + 11_000)
    row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(9)
  })

  it('does not create a row for a report on an unknown instance', async () => {
    await freshDb()
    const { getCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
    await recordCanvasReport('ghost', { appliedRevision: 1, clockOffsetMs: null, clockUncertaintyMs: null, viewportW: null, viewportH: null, fpsAvg: null }, 1_000_000)
    expect(await getCanvasState('ghost')).toBeNull()
  })
})
