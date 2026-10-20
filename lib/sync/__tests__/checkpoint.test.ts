import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'

// Task 9 — checkpoints (M2, spec §8.3): the pull cursor must be persisted
// and sent as `since` on the next cycle instead of re-pulling everything.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/checkpoint-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

const ORIGINAL_FETCH = globalThis.fetch
let pullUrls: string[] = []

function stubConsole(cursor: string) {
  pullUrls = []
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input)
    if (url.endsWith('/api/sync/push')) {
      return Response.json({ accepted: [], conflicts: [], rejected: [] })
    }
    pullUrls.push(url)
    return Response.json({ changes: [], cursor, resolvedConflicts: [] })
  }) as typeof globalThis.fetch
}
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

async function checkpointRow(instanceId: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb()
  const { syncCheckpoints } = getTables()
  const [row] = await db.select().from(syncCheckpoints).where(eq(syncCheckpoints.id, instanceId))
  return row
}

describe('sync checkpoints', () => {
  it('runSyncCycle persists the returned cursor to sync_checkpoints', async () => {
    await freshDb()
    const C1 = new Date(Date.now() - 60_000).toISOString()
    stubConsole(C1)
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://fake', token: 't', instanceId: 'inst-cp' })

    const row = await checkpointRow('inst-cp')
    expect(row?.cursor).toBe(C1)
  })

  it('the next cycle sends the stored cursor as `since`', async () => {
    await freshDb()
    const C1 = new Date(Date.now() - 120_000).toISOString()
    const C2 = new Date(Date.now() - 60_000).toISOString()
    const { runSyncCycle } = await import('@/lib/sync/client')

    stubConsole(C1)
    await runSyncCycle({ endpoint: 'http://fake', token: 't', instanceId: 'inst-cp2' })
    stubConsole(C2)
    await runSyncCycle({ endpoint: 'http://fake', token: 't', instanceId: 'inst-cp2' })

    expect(pullUrls.length).toBe(1)
    expect(pullUrls[0]).toContain(`since=${encodeURIComponent(C1)}`)
    const row = await checkpointRow('inst-cp2')
    expect(row.cursor).toBe(C2)
  })
})
