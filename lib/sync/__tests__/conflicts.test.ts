import { describe, it, expect, beforeAll, afterEach } from 'vitest'

// Task 6 — conflict protocol (H1, spec §5.2/§8.4):
// (a) true concurrent edit -> conflict recorded, local queue row PRESERVED
//     with status 'conflict' (nothing deleted, no silent drop);
// (b) clean push after remote advanced only via this instance's own earlier
//     push -> accepted, no conflict;
// (c) retry after network failure reuses the idempotency key and is a no-op.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/conflict-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('conflict protocol (server)', () => {
  it('true divergent edit conflicts and the idempotency key is not burned', async () => {
    await freshDb()
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id: 'f1', identifier: 'f1', name: 'f1', data: { rev: 'console-side' },
      createdAt: now, updatedAt: now, revision: 3,
    })

    // instance last saw revision 1; console advanced to 3 -> genuine divergence
    const out = await handlePush('f1', [{
      idempotencyKey: 'ck-1', entityType: 'frame_document', entityId: 'f1',
      operation: 'upsert', payload: { rev: 'instance-side' }, baseRevision: 1,
    }])
    expect(out.conflicts.length).toBe(1)
    expect(out.accepted).toEqual([])

    // key NOT burned: the same key after resolution must be processable
    const keys = await db.select().from(tables.idempotencyKeys)
    expect((keys as any[]).some((k) => k.key === 'ck-1')).toBe(false)

    // conflict recorded server-side
    const conflicts = await db.select().from(tables.syncConflicts)
    expect((conflicts as any[]).length).toBe(1)
    expect((conflicts as any[])[0].localRevision).toBe(1)
    expect((conflicts as any[])[0].remoteRevision).toBe(3)
  })

  it('no conflict when remote advanced only via this instance own earlier push', async () => {
    await freshDb()
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb()
    const tables = getTables()
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id: 'f1', identifier: 'f1', name: 'f1', data: { rev: 0 },
      createdAt: now, updatedAt: now, revision: 1,
    })

    const first = await handlePush('f1', [{
      idempotencyKey: 'ck-a', entityType: 'frame_document', entityId: 'f1',
      operation: 'upsert', payload: { rev: 1 }, baseRevision: 1,
    }])
    expect(first.accepted).toEqual(['ck-a'])
    expect(first.conflicts).toEqual([])

    // remote is now 2; instance base is 2 (its own push) -> clean
    const second = await handlePush('f1', [{
      idempotencyKey: 'ck-b', entityType: 'frame_document', entityId: 'f1',
      operation: 'upsert', payload: { rev: 2 }, baseRevision: 2,
    }])
    expect(second.accepted).toEqual(['ck-b'])
    expect(second.conflicts).toEqual([])
  })

  it('duplicate accepted key short-circuits (network-failure retry is idempotent)', async () => {
    await freshDb()
    const { handlePush } = await import('@/lib/sync/server')
    const change = {
      idempotencyKey: 'ck-dup', entityType: 'frame_document', entityId: 'x1',
      operation: 'upsert' as const, payload: { rev: 1 }, baseRevision: 0,
    }
    const first = await handlePush('x1', [change])
    expect(first.accepted).toEqual(['ck-dup'])
    const retry = await handlePush('x1', [change])
    expect(retry.accepted).toEqual(['ck-dup'])
    expect(retry.conflicts).toEqual([])
  })
})

describe('conflict protocol (client + queue)', () => {
  const ORIGINAL_FETCH = globalThis.fetch
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

  it('queue rows carry baseRevision through enqueue', async () => {
    await freshDb()
    const { enqueueChange, getPending } = await import('@/lib/sync/queue')
    await enqueueChange({
      entityType: 'frame_document', entityId: 'f1', operation: 'upsert',
      payload: { v: 1 }, idempotencyKey: 'qk-1', baseRevision: 4,
    })
    const pending = await getPending()
    expect(pending[0].baseRevision).toBe(4)
  })

  it('push sends baseRevision and conflict items go terminal status conflict (kept, not retried)', async () => {
    await freshDb()
    const { enqueueChange, getPending, conflictCount } = await import('@/lib/sync/queue')
    await enqueueChange({
      entityType: 'frame_document', entityId: 'f1', operation: 'upsert',
      payload: { v: 9 }, idempotencyKey: 'qk-2', baseRevision: 1,
    })

    let sentBody: any = null
    globalThis.fetch = (async (_url: any, init: any) => {
      sentBody = JSON.parse(String(init.body))
      return new Response(JSON.stringify({
        accepted: [],
        conflicts: [{ idempotencyKey: 'qk-2', entityType: 'frame_document', entityId: 'f1', localRevision: 1, remoteRevision: 3 }],
        rejected: [],
      }), { headers: { 'Content-Type': 'application/json' } })
    }) as typeof globalThis.fetch

    const { pushPending } = await import('@/lib/sync/client')
    await pushPending({ endpoint: 'http://127.0.0.1:1', token: 't', instanceId: 'f1' })

    // the change must have carried baseRevision
    expect(sentBody.changes[0].baseRevision).toBe(1)
    // the item is preserved in a terminal conflict state, NOT pending (no
    // infinite retry) and NOT deleted (no silent drop)
    const pendingAfter = await getPending()
    expect(pendingAfter.length).toBe(0)
    expect(await conflictCount()).toBe(1)
  })

  it('resolve local re-applies the instance payload; resolve remote keeps console doc', async () => {
    await freshDb()
    const { resolveConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    const tables = getTables()
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id: 'f9', identifier: 'f9', name: 'f9', data: { rev: 'console' },
      createdAt: now, updatedAt: now, revision: 2,
    })
    const out = await handlePush('f9', [{
      idempotencyKey: 'rk-1', entityType: 'frame_document', entityId: 'f9',
      operation: 'upsert', payload: { rev: 'instance' }, baseRevision: 1,
    }])
    expect(out.conflicts.length).toBe(1)
    const conflicts = await listConflicts()
    expect(conflicts.length).toBe(1)

    // remote wins first: doc untouched
    await resolveConflict(conflicts[0].id, 'remote')
    let [doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'f9'))
    expect((doc.data as any).rev).toBe('console')
    expect(doc.revision).toBe(2)
    const rowsAfter = await db.select().from(tables.syncConflicts)
    expect(rowsAfter[0].status).toBe('remote')

    // fresh conflict, now local wins: instance payload applied, revision bumped
    await db.delete(tables.syncConflicts)
    const out2 = await handlePush('f9', [{
      idempotencyKey: 'rk-2', entityType: 'frame_document', entityId: 'f9',
      operation: 'upsert', payload: { rev: 'instance2' }, baseRevision: 1,
    }])
    expect(out2.conflicts.length).toBe(1)
    const c2 = (await listConflicts())[0]
    await resolveConflict(c2.id, 'local', 'tester')
    ;[doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'f9'))
    expect((doc.data as any).rev).toBe('instance2')
    expect(doc.revision).toBe(3)
    expect(doc.updatedBy).toBe('tester')
  })
})

describe('legacy instance DB upgrade', () => {
  it('runMigrations adds base_revision to a pre-existing sync_queue table', async () => {
    env.FRAME_DB_PATH = ':memory:'
    const { getSqliteRaw, resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const raw = getSqliteRaw()
    // legacy shape: no base_revision column
    raw.exec(`CREATE TABLE sync_queue (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', idempotency_key TEXT NOT NULL UNIQUE);`)
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    await runMigrations() // second run must tolerate duplicate column
    const cols = (raw as any).prepare("PRAGMA table_info(sync_queue)").all()
    expect(cols.some((c: any) => c.name === 'base_revision')).toBe(true)
  })
})
