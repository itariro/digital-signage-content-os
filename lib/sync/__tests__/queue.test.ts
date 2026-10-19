import { describe, it, expect, beforeAll } from 'vitest'

describe('sync queue', () => {
  beforeAll(() => {
    process.env.FRAME_MODE = 'instance'
    process.env.FRAME_DB_PATH = ':memory:'
    const fs = require('node:fs')
    fs.mkdirSync('/tmp/scratchpad/qdata', { recursive: true })
    process.env.FRAME_DATA_DIR = '/tmp/scratchpad/qdata'
  })
  it('enqueue + pending + done', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { enqueueChange, getPending, markDone, pendingCount } = await import('@/lib/sync/queue')
    await enqueueChange({ entityType: 'frame_document', entityId: 'home', operation: 'upsert', payload: { a: 1 }, idempotencyKey: 'k' })
    expect(await pendingCount()).toBe(1)
    const pending = await getPending()
    expect(pending.length).toBe(1)
    await markDone([pending[0].id])
    expect(await pendingCount()).toBe(0)
  })
})
