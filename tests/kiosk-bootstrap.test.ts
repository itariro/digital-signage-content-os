import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'

// Final review C-2: a fresh kiosk (migrations-only sqlite, no frame docs
// seeded, INSTANCE_ID set) must bootstrap from the console: the pull applies
// the instance's console document into the local home frame, and local home
// edits push under the instance id.
const env = process.env as Record<string, string | undefined>
const TOKEN = 'kb-token'
const INSTANCE = 'kb-1'

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/kb-adata'
  env.INSTANCE_ID = INSTANCE
})

afterEach(() => {
  globalThis.fetch = ORIGINAL
})
const ORIGINAL = globalThis.fetch

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  // console-side state only: registered instance + its seeded document.
  // NO local home document exists yet (fresh kiosk).
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { hashToken } = await import('@/lib/sync/auth')
  const tables = getTables()
  const now = new Date()
  await getDb().insert(tables.instances).values({ id: INSTANCE, deviceTokenHash: hashToken(TOKEN), createdAt: now })
  await getDb().insert(tables.frameDocuments).values({
    id: INSTANCE, identifier: INSTANCE, name: 'Office loop', data: { v: 'console-seed' },
    createdAt: now, updatedAt: now, revision: 2,
  })
}

function wireRoutes() {
  globalThis.fetch = (async (input: any, init: any) => {
    const { NextRequest } = await import('next/server')
    const url = String(input)
    const req = new NextRequest(url, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init?.headers as any ?? {}) },
      body: init?.body,
    })
    if (url.endsWith('/api/sync/push')) {
      const { POST } = await import('@/app/api/sync/push/route')
      return POST(req)
    }
    const { GET } = await import('@/app/api/sync/pull/route')
    return GET(req)
  }) as typeof globalThis.fetch
}

async function docOf(identifier: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const tables = getTables()
  const [row] = await getDb().select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, identifier))
  return row
}

describe('kiosk bootstrap', () => {
  it('first pull creates the local home frame from the console document', async () => {
    await freshDb()
    wireRoutes()
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE })

    const home = await docOf('home')
    expect(home).toBeTruthy()
    expect((home.data as any).v).toBe('console-seed')
    expect(home.revision).toBe(2)
  })

  it('local home edits push under the instance id and update the console doc', async () => {
    await freshDb()
    wireRoutes()
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE })

    const { mutateStore } = await import('@/lib/store')
    const { getPending } = await import('@/lib/sync/queue')
    await mutateStore(() => ({ v: 'from-kiosk' }) as any, 'home')
    const [item] = await getPending()
    expect(item.entityId).toBe(INSTANCE) // translated at the sync boundary

    const { pushPending } = await import('@/lib/sync/client')
    await pushPending({ endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE })
    const consoleDoc = await docOf(INSTANCE)
    expect((consoleDoc.data as any).v).toBe('from-kiosk')
  })

  it('pull of an unregistered second frame creates it locally (remote-apply create)', async () => {
    await freshDb()
    wireRoutes()
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE })

    // dev-bypass pull would fetch everything; instead simulate a delivered
    // change for a registered extra frame via pullRemote with stub response.
    const { NextResponse } = await import('next/server')
    globalThis.fetch = (async () => NextResponse.json({
      changes: [{ entityType: 'frame_document', entityId: 'kb-1-kitchen', operation: 'upsert', payload: { v: 'kitchen-console' }, revision: 5, updatedAt: new Date().toISOString() }],
      cursor: new Date().toISOString(),
      resolvedConflicts: [],
    })) as typeof globalThis.fetch
    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console.test', token: TOKEN, instanceId: INSTANCE })

    const kitchen = await docOf('kb-1-kitchen')
    expect(kitchen).toBeTruthy()
    expect((kitchen.data as any).v).toBe('kitchen-console')
    expect(kitchen.revision).toBe(5)
  })
})
