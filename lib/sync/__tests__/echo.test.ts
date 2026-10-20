import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'

// Task 8 — echo loop (H2): pullRemote applied remote changes through the
// normal mutate path, which re-enqueued and bumped the revision, so every
// pull produced a fresh push (revision ping-pong between peers). Remote
// applies must be authoritative: payload + remote revision, no enqueue.
// Also: a console-resolved conflict must clear the instance's terminal
// 'conflict' queue row (completes the Task 6 resolution loop).
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/echo-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function docRow() {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb()
  const tables = getTables()
  const [row] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'home'))
  return row
}

const ORIGINAL_FETCH = globalThis.fetch

function stubPull(payload: unknown, revision: number, resolvedConflicts?: Array<{ entityId: string; resolution: string }>) {
  globalThis.fetch = (async () => Response.json({
    changes: [{ entityType: 'frame_document', entityId: 'home', operation: 'upsert', payload, revision, updatedAt: new Date().toISOString() }],
    cursor: new Date().toISOString(),
    resolvedConflicts: resolvedConflicts ?? [],
  })) as typeof globalThis.fetch
}
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

describe('pull echo suppression', () => {
  it('remote apply keeps the remote revision authoritative and enqueues nothing', async () => {
    await freshDb()
    const { mutateStore, readStore } = await import('@/lib/store')
    await mutateStore((s) => { s.customFonts.push('seed') }, 'home')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()
    // stand in for a console-side advance (config push landed rev 42)
    await db.update(tables.frameDocuments).set({ revision: 42 }).where(eq(tables.frameDocuments.identifier, 'home'))
    // drain the seed edit's queue row: this test isolates the pull path
    await db.delete(tables.syncQueue)

    const remote = await readStore('home')
    if (!remote) throw new Error('seed store missing')
    remote.customFonts = ['from-console']

    stubPull(remote, 42)
    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://fake', token: 't', instanceId: 'home' })

    const after = await docRow()
    expect(after.revision).toBe(42)
    expect((after.data as any).customFonts).toEqual(['from-console'])

    const { pendingCount } = await import('@/lib/sync/queue')
    expect(await pendingCount()).toBe(0)

    // a second identical pull is inert too (no churn across cycles)
    stubPull(remote, 42)
    await pullRemote({ endpoint: 'http://fake', token: 't', instanceId: 'home' })
    const after2 = await docRow()
    expect(after2.revision).toBe(42)
    expect(await pendingCount()).toBe(0)
  })

  it('a genuine local edit still enqueues with baseRevision', async () => {
    await freshDb()
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.customFonts.push('local-edit') }, 'home')
    const { getPending } = await import('@/lib/sync/queue')
    const pending = await getPending()
    expect(pending.length).toBe(1)
    expect(pending[0].baseRevision).toBe(1) // seeded rev 1 -> edit at rev 2
  })
})

describe('resolved conflicts clear instance queue rows', () => {
  it('pull delivers resolved conflicts and the terminal conflict row is dropped', async () => {
    await freshDb()
    const { enqueueChange, getPending, markConflict, conflictCount } = await import('@/lib/sync/queue')
    const { handlePush } = await import('@/lib/sync/server')
    const { resolveConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()

    await db.insert(tables.frameDocuments).values({
      id: 'home', identifier: 'home', name: 'home', data: { customFonts: ['console'] },
      createdAt: new Date(), updatedAt: new Date(), revision: 5,
    })
    await enqueueChange({ entityType: 'frame_document', entityId: 'home', operation: 'upsert', payload: { customFonts: ['local'] }, idempotencyKey: 'echo-cf', baseRevision: 1 })
    const [item] = await getPending()
    const out = await handlePush('home', [{ idempotencyKey: 'echo-cf', entityType: 'frame_document', entityId: 'home', operation: 'upsert', payload: { customFonts: ['local'] }, baseRevision: 1 }])
    expect(out.conflicts.length).toBe(1)
    await markConflict(item.id, 'conflict')
    expect(await conflictCount()).toBe(1)

    // admin resolves: console version wins
    const conflicts = await listConflicts()
    await resolveConflict(conflicts[0].id, 'remote')

    stubPull({ customFonts: ['console'] }, 5, [{ entityId: 'home', resolution: 'remote' }])
    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://fake', token: 't', instanceId: 'home' })

    expect(await conflictCount()).toBe(0)
    const doc = await docRow()
    expect((doc.data as any).customFonts).toEqual(['console'])
    const { pendingCount } = await import('@/lib/sync/queue')
    expect(await pendingCount()).toBe(0)
  })
})
