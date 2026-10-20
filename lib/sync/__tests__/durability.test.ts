import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

// Task 7 — durable queue (H5, M1, spec §8.1): crash-stranded inflight items
// are reclaimed, exhausted retries dead-letter visibly, enqueue failures log.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/durable-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function setStatus(id: string, status: string, nextAttemptAt?: Date) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { eq } = await import('drizzle-orm')
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  await db.update(syncQueue).set(nextAttemptAt ? { status, nextAttemptAt } : { status }).where(eq(syncQueue.id, id))
}

async function rowOf(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { eq } = await import('drizzle-orm')
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const [row] = await db.select().from(syncQueue).where(eq(syncQueue.id, id))
  return row
}

describe('inflight reclaim', () => {
  it('markInflight makes the item invisible until the timeout passes, then it is reclaimed', async () => {
    await freshDb()
    const { enqueueChange, getPending, markInflight } = await import('@/lib/sync/queue')
    await enqueueChange({ entityType: 'frame_document', entityId: 'f1', operation: 'upsert', payload: { v: 1 }, idempotencyKey: 'd1' })
    const [item] = await getPending()

    await markInflight([item.id])
    // in flight: not eligible yet (fresh timestamp)
    expect((await getPending()).length).toBe(0)

    // simulate crash: stamp the inflight deadline in the past
    await setStatus(item.id, 'inflight', new Date(Date.now() - 1000))
    const reclaimed = await getPending()
    expect(reclaimed.map((p: any) => p.id)).toContain(item.id)
  })
})

describe('dead-letter', () => {
  it('exhausted retries land in terminal failed status, kept and visible', async () => {
    await freshDb()
    const { enqueueChange, getPending, markFailed, failedCount } = await import('@/lib/sync/queue')
    await enqueueChange({ entityType: 'frame_document', entityId: 'f1', operation: 'upsert', payload: { v: 1 }, idempotencyKey: 'd2' })
    const [item] = await getPending()

    for (let i = 0; i < 12; i++) await markFailed(item.id, 'boom')

    const row = await rowOf(item.id)
    expect(row.status).toBe('failed')
    expect((await getPending()).length).toBe(0)
    expect(await failedCount()).toBe(1)
  })
})

describe('conflict items stay out of the retry loop', () => {
  it('status conflict is never returned by getPending', async () => {
    await freshDb()
    const { enqueueChange, markConflict, getPending } = await import('@/lib/sync/queue')
    await enqueueChange({ entityType: 'frame_document', entityId: 'f1', operation: 'upsert', payload: { v: 1 }, idempotencyKey: 'd3' })
    const [item] = await getPending()
    await markConflict(item.id, 'conflict')
    expect((await getPending()).length).toBe(0)
    expect((await rowOf(item.id)).status).toBe('conflict')
  })
})

describe('enqueue failure logging (M1)', () => {
  afterEach(() => { vi.doUnmock('@/lib/sync/queue'); vi.resetModules() })

  it('logs with context when enqueue fails after a committed write', async () => {
    await freshDb()
    env.FRAME_MODE = 'instance'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/lib/sync/queue', () => ({
      enqueueChange: async () => { throw new Error('disk full') },
      getPending: async () => [],
      markInflight: async () => {},
      markDone: async () => {},
      markFailed: async () => {},
      markConflict: async () => {},
      pendingCount: async () => 0,
      conflictCount: async () => 0,
      failedCount: async () => 0,
    }))
    const store = await import('@/lib/store')
    await store.mutateStore(() => { /* no-op edit */ }, 'home')
    expect(errSpy).toHaveBeenCalled()
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join(' ')
    expect(logged).toMatch(/enqueue/i)
    errSpy.mockRestore()
    delete env.FRAME_MODE
  })
})
