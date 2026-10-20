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

describe('single-frame ownership and rejection visibility (C-3)', () => {
  it('a provisioned kiosk may only push its OWN document (entityId === instanceId)', async () => {
    await freshDb()
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const db = getDb() as any
    const tables = getTables() as any
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id: 'mf-1', identifier: 'mf-1', name: 'mf-1', data: { v: 0 },
      createdAt: now, updatedAt: now, revision: 1,
    })
    // its own document: accepted
    const own = await handlePush('mf-1', [{
      idempotencyKey: 'mf-own', entityType: 'frame_document', entityId: 'mf-1',
      operation: 'upsert', payload: { v: 'self' }, baseRevision: 1,
    }])
    expect(own.accepted).toEqual(['mf-own'])
    // a second frame in the same namespace: now REJECTED (single-frame model)
    const second = await handlePush('mf-1', [{
      idempotencyKey: 'mf-2nd', entityType: 'frame_document', entityId: 'mf-1-kitchen',
      operation: 'upsert', payload: { v: 'kitchen' }, baseRevision: 0,
    }])
    expect(second.rejected.map((r) => r.idempotencyKey)).toEqual(['mf-2nd'])
    const [kitchen] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'mf-1-kitchen'))
    expect(kitchen).toBeUndefined()
  })

  it('a foreign entity rejection records a visible rejected conflict (deduped)', async () => {
    await freshDb()
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb() as any
    const tables = getTables() as any
    const change = (key: string) => [{
      idempotencyKey: key, entityType: 'frame_document', entityId: 'other-inst',
      operation: 'upsert' as const, payload: { v: 1 }, baseRevision: 0,
    }]
    const out = await handlePush('mf-2', change('rf-1'))
    expect(out.rejected.length).toBe(1)
    const rows = await db.select().from(tables.syncConflicts)
    const rejectedRows = (rows as any[]).filter((r) => r.status === 'rejected' && r.entityId === 'other-inst')
    expect(rejectedRows.length).toBe(1)
    // repeated rejection of the same entity/instance does not pile up rows
    await handlePush('mf-2', change('rf-2'))
    const rows2 = await db.select().from(tables.syncConflicts)
    expect((rows2 as any[]).filter((r) => r.status === 'rejected' && r.entityId === 'other-inst').length).toBe(1)
  })

  it('resolve discarded clears the instance queue row via pull (rejected not registerable)', async () => {
    await freshDb()
    const { handlePush, handlePull } = await import('@/lib/sync/server')
    const { resolveConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb() as any
    const tables = getTables() as any

    await handlePush('mf-3', [{
      idempotencyKey: 'rc-1', entityType: 'frame_document', entityId: 'other-lounge',
      operation: 'upsert', payload: { v: 'other' }, baseRevision: 0,
    }])
    const conflicts = await listConflicts()
    const rej = (conflicts as any[]).find((c) => c.status === 'rejected')
    expect(rej).toBeTruthy()

    // rejected writes are NOT registerable on a single-frame kiosk
    const badResolve = await resolveConflict(rej.id, 'local')
    expect(badResolve).toBeNull()

    // operator discards the stray write
    const resolved = await resolveConflict(rej.id, 'discard')
    expect(resolved?.status).toBe('discarded')

    // delivered as resolved so the instance retires its parked row
    const pulled = await handlePull('mf-3')
    expect(pulled.resolvedConflicts.some((r) => r.entityId === rej.entityId && r.resolution === 'discarded')).toBe(true)
    void db; void tables
  })

  it('resolve remote re-touches the console doc so pull re-delivers it (I-1)', async () => {
    await freshDb()
    const { handlePush, handlePull } = await import('@/lib/sync/server')
    const { resolveConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const db = getDb() as any
    const tables = getTables() as any
    const old = new Date(Date.now() - 60_000)
    await db.insert(tables.frameDocuments).values({
      id: 'mf-4', identifier: 'mf-4', name: 'mf-4', data: { v: 'console' },
      createdAt: old, updatedAt: old, revision: 3,
    })
    await handlePush('mf-4', [{
      idempotencyKey: 'rm-1', entityType: 'frame_document', entityId: 'mf-4',
      operation: 'upsert', payload: { v: 'stale-local' }, baseRevision: 1,
    }])
    const conflicts = await listConflicts()
    const cf = (conflicts as any[]).find((c) => c.status === 'open')!
    await resolveConflict(cf.id, 'remote')

    // the instance had already pulled up to 'old'; the console doc must be
    // re-delivered after the touch so the kiosk converges on console content
    const pulled = await handlePull('mf-4', old.toISOString())
    expect(pulled.changes.length).toBe(1)
    const [doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'mf-4'))
    expect((doc.data as any).v).toBe('console') // content kept
    expect(doc.revision).toBe(3) // revision kept
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
