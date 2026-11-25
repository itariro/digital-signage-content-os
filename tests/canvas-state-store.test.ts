import { beforeAll, describe, expect, it } from 'vitest'

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
