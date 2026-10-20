import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'

// Task 15 — the Stage-3 verification the PR body claimed but never committed.
// Full two-sided sync through the REAL route handlers. Console side runs on
// Postgres when DATABASE_URL is present (fresh frame_rt database so the
// suite never shares a schema with other files); otherwise both halves
// share the in-memory sqlite stand-in.
//
// Local edits are enqueued directly (baseRevision = doc revision at enqueue)
// rather than through mutateStore: in the sqlite stand-in instance and
// console share one row, and mutateStore's own bump would put that row one
// revision ahead of the push base. mutateStore's enqueue path is covered by
// the echo/config-push suites.
const env = process.env as Record<string, string | undefined>
const hasPg = Boolean(process.env.DATABASE_URL)
const BASE_PG_URL = process.env.DATABASE_URL

const TOKEN = 'rt-device-token'
const INSTANCE = 'rt-1'

beforeAll(async () => {
  env.FRAME_MODE = 'instance'
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/rt-adata'
  delete env.SYNC_SECRET

  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  const { resetStoreCache } = await import('@/lib/store')
  resetSqliteDb(); resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()

  if (hasPg) {
    const { Client } = await import('pg')
    const fs = await import('node:fs')
    const admin = new Client({ connectionString: BASE_PG_URL })
    await admin.connect()
    await admin.query('DROP DATABASE IF EXISTS frame_rt')
    await admin.query('CREATE DATABASE frame_rt')
    await admin.end()
    const rt = new Client({ connectionString: 'postgresql://frame@127.0.0.1:5433/frame_rt' })
    await rt.connect()
    for (const f of fs.readdirSync('drizzle').filter((n: string) => n.endsWith('.sql')).sort()) {
      await rt.query(fs.readFileSync(`drizzle/${f}`, 'utf8'))
    }
    const { hashToken } = await import('@/lib/sync/auth')
    const now = new Date()
    await rt.query(
      'INSERT INTO instances (id, device_token_hash, created_at) VALUES ($1, $2, $3)',
      [INSTANCE, hashToken(TOKEN), now],
    )
    await rt.query(
      'INSERT INTO frame_documents (id, identifier, name, data, created_at, updated_at, revision) VALUES ($1, $2, $3, $4, $5, $6, 1)',
      [INSTANCE, INSTANCE, INSTANCE, JSON.stringify({ v: 'console-init' }), now, now],
    )
    await rt.end()
    // point the app's pg pool at the dedicated database (first pool use
    // happens below, after this line)
    process.env.DATABASE_URL = 'postgresql://frame@127.0.0.1:5433/frame_rt'
  }

  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const tables = getTables()
  const { hashToken } = await import('@/lib/sync/auth')
  // sqlite flavor: device token must authenticate against the local
  // instances table too (pg flavor also has the row seeded above)
  await getDb().insert(tables.instances).values({
    id: INSTANCE, deviceTokenHash: hashToken(TOKEN), createdAt: new Date(),
  })
  await getDb().insert(tables.frameDocuments).values({
    id: INSTANCE, identifier: INSTANCE, name: INSTANCE, data: { v: 'local-init' },
    createdAt: new Date(), updatedAt: new Date(), revision: 1,
  })
}, 60_000)

const ORIGINAL_FETCH = globalThis.fetch
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  delete env.FRAME_MODE
})

function consoleHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }
}

function consoleMode() {
  env.FRAME_MODE = hasPg ? 'console' : 'instance'
}
function instanceMode() {
  env.FRAME_MODE = 'instance'
}

// Route the client's fetch into the REAL console handlers, switching
// FRAME_MODE around the handler so getDb() dispatches to the console side.
// The cycle awaits calls sequentially, so the switch cannot interleave.
function wireConsoleRoutes() {
  globalThis.fetch = (async (input: any, init: any) => {
    const { NextRequest } = await import('next/server')
    const url = String(input)
    consoleMode()
    try {
      const req = new NextRequest(url, {
        method: init?.method ?? 'GET',
        headers: { ...consoleHeaders(), ...(init?.headers as Record<string, string> ?? {}) },
        body: init?.body,
      })
      if (url.endsWith('/api/sync/push')) {
        const { POST } = await import('@/app/api/sync/push/route')
        return await POST(req)
      }
      const { GET } = await import('@/app/api/sync/pull/route')
      return await GET(req)
    } finally {
      instanceMode()
    }
  }) as typeof globalThis.fetch
}

async function instanceDoc() {
  instanceMode()
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const tables = getTables()
  const [row] = await getDb().select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, INSTANCE))
  return row
}

async function consoleDoc() {
  consoleMode()
  try {
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const tables = getTables()
    const [row] = await getDb().select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, INSTANCE))
    return row
  } finally {
    instanceMode()
  }
}

async function consoleWrite(data: unknown) {
  consoleMode()
  try {
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const tables = getTables()
    const [row] = await getDb().select({ revision: tables.frameDocuments.revision }).from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, INSTANCE))
    await getDb().update(tables.frameDocuments)
      .set({ data, updatedAt: new Date(), revision: (row?.revision ?? 1) + 1 })
      .where(eq(tables.frameDocuments.identifier, INSTANCE))
  } finally {
    instanceMode()
  }
}

// wipe leftover queue/conflict/idempotency/checkpoint rows so each test is
// independent (they share this worker's databases)
async function resetSyncState() {
  const modes = hasPg ? ['instance', 'console'] : ['instance']
  for (const mode of modes) {
    env.FRAME_MODE = mode
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const t = getTables()
    const db = getDb()
    await db.delete(t.syncQueue)
    await db.delete(t.syncConflicts)
    await db.delete(t.idempotencyKeys)
    await db.delete(t.syncCheckpoints)
  }
  instanceMode()
}

async function makeRetryEligible() {
  // stand in for the backoff wait after a network-cut markFailed
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const t = getTables()
  await getDb().update(t.syncQueue).set({ nextAttemptAt: new Date(Date.now() - 1000) })
}

const CONFIG = { endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE }

describe('e2e sync round-trip', () => {
  it('instance write reaches the console; console write reaches the instance; queue drains; idle cycles are inert', async () => {
    wireConsoleRoutes()
    await resetSyncState()
    const { enqueueChange, pendingCount } = await import('@/lib/sync/queue')
    const { runSyncCycle } = await import('@/lib/sync/client')

    await enqueueChange({ entityType: 'frame_document', entityId: INSTANCE, operation: 'upsert', payload: { v: 'from-instance' }, idempotencyKey: 'rt-1', baseRevision: (await consoleDoc()).revision })
    expect(await pendingCount()).toBe(1)

    await runSyncCycle(CONFIG)
    expect(await pendingCount()).toBe(0)
    expect((await consoleDoc()).data as any).toMatchObject({ v: 'from-instance' })

    await consoleWrite({ v: 'from-console' })
    await runSyncCycle(CONFIG)
    const idoc = await instanceDoc()
    expect((idoc.data as any).v).toBe('from-console')
    expect(idoc.revision).toBe((await consoleDoc()).revision)
    expect(await pendingCount()).toBe(0)

    const revBefore = (await consoleDoc()).revision
    await runSyncCycle(CONFIG)
    await runSyncCycle(CONFIG)
    expect((await consoleDoc()).revision).toBe(revBefore)
    expect(await pendingCount()).toBe(0)
  })

  it('interrupted push: retry with the same key delivers exactly once', async () => {
    wireConsoleRoutes()
    await resetSyncState()
    const { enqueueChange, pendingCount } = await import('@/lib/sync/queue')
    const { pushPending } = await import('@/lib/sync/client')
    const rev = (await consoleDoc()).revision
    await enqueueChange({ entityType: 'frame_document', entityId: INSTANCE, operation: 'upsert', payload: { v: 'once' }, idempotencyKey: 'rt-cut', baseRevision: rev })

    const real = globalThis.fetch
    globalThis.fetch = (async (input: any, init: any) => {
      if (String(input).endsWith('/api/sync/push')) throw new Error('network cut')
      return real(input, init)
    }) as typeof globalThis.fetch
    await expect(pushPending(CONFIG)).rejects.toThrow('network cut')
    globalThis.fetch = real
    expect(await pendingCount()).toBe(1) // requeued for retry, same key
    await makeRetryEligible() // backoff elapsed

    const revBefore = (await consoleDoc()).revision
    await pushPending(CONFIG)
    const cdoc = await consoleDoc()
    expect((cdoc.data as any).v).toBe('once')
    expect(cdoc.revision).toBe(revBefore + 1) // applied exactly once
    expect(await pendingCount()).toBe(0)
  })

  it('duplicate batch: resending accepted keys no-ops', async () => {
    wireConsoleRoutes()
    await resetSyncState()
    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/sync/push/route')
    const rev = (await consoleDoc()).revision
    const batch = { apiVersion: '1.0', changes: [{ idempotencyKey: 'rt-dup', entityType: 'frame_document', entityId: INSTANCE, operation: 'upsert', payload: { v: 'batched' }, baseRevision: rev }] }
    const mk = () => new NextRequest('http://console.test/api/sync/push', { method: 'POST', headers: consoleHeaders(), body: JSON.stringify(batch) })
    consoleMode()
    try {
      const first = await POST(mk())
      expect((await first.json()).accepted).toEqual(['rt-dup'])
      const before = (await consoleDoc()).revision
      const second = await POST(mk())
      const body = await second.json()
      expect(body.accepted).toEqual(['rt-dup'])
      expect(body.conflicts).toEqual([])
      expect((await consoleDoc()).revision).toBe(before) // no double-apply
    } finally {
      instanceMode()
    }
  })

  it('conflict diverges through the routes: visible in status, resolvable via console', async () => {
    wireConsoleRoutes()
    await resetSyncState()
    const { enqueueChange, conflictCount, pendingCount } = await import('@/lib/sync/queue')
    const { runSyncCycle } = await import('@/lib/sync/client')

    await enqueueChange({ entityType: 'frame_document', entityId: INSTANCE, operation: 'upsert', payload: { v: 'divergent' }, idempotencyKey: 'rt-cf', baseRevision: 0 })
    await runSyncCycle(CONFIG)

    expect(await pendingCount()).toBe(0)
    expect(await conflictCount()).toBe(1)
    const { GET: statusGET } = await import('@/app/api/sync/status/route')
    const status = await (await statusGET()).json()
    expect(status.conflictCount).toBe(1)

    consoleMode()
    try {
      const { listConflicts, resolveConflict } = await import('@/lib/sync/conflicts')
      const rows = await listConflicts()
      expect(rows.length).toBeGreaterThan(0)
      await resolveConflict(rows[rows.length - 1].id, 'remote')
    } finally {
      instanceMode()
    }

    await runSyncCycle(CONFIG)
    expect(await conflictCount()).toBe(0)
  })
})
