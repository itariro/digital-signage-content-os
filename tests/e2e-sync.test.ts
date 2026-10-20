import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'

// Ownership-scoped sync: an instance may only write/pull its own frame document.
// Runs the real route handlers against sqlite (no FRAME_MODE/DATABASE_URL).
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.SYNC_SECRET
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/e2e-adata'
})

const tokens = { a: 'token-aaaa', b: 'token-bbbb' }
const API_VERSION = '1.0'

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { hashToken } = await import('@/lib/sync/auth')
  const db = getDb() as any
  const tables = getTables() as any
  const now = new Date()
  for (const [id, token] of [['inst-a', tokens.a], ['inst-b', tokens.b]] as const) {
    await db.insert(tables.instances).values({ id, deviceTokenHash: hashToken(token), createdAt: now })
    await db.insert(tables.frameDocuments).values({
      id, identifier: id, name: id, data: { v: 0 }, createdAt: now, updatedAt: now,
      revision: 1, resolutionWidth: 1920, resolutionHeight: 1080,
    })
  }
  return { db, tables }
}

async function pushRequest(instanceKey: 'a' | 'b' | 'secret', body: unknown) {
  const { NextRequest } = await import('next/server')
  const bearer = instanceKey === 'secret' ? 'dev-secret' : tokens[instanceKey]
  return new NextRequest('http://localhost/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  })
}

async function pullRequest(instanceKey: 'a' | 'b', params: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  const url = new URL('http://localhost/api/sync/pull')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString(), { headers: { Authorization: `Bearer ${tokens[instanceKey]}` } })
}

describe('e2e sync ownership', () => {
  it('instance A can push an upsert to its own frame document', async () => {
    const { db, tables } = await freshDb()
    const { POST } = await import('@/app/api/sync/push/route')
    const res = await POST(await pushRequest('a', {
      instanceId: 'inst-a', apiVersion: API_VERSION,
      changes: [{ idempotencyKey: 'k1', entityType: 'frame_document', entityId: 'inst-a', operation: 'upsert', payload: { v: 1 } }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toContain('k1')
    const [a] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'inst-a'))
    expect(a.data.v).toBe(1)
  })

  it('instance B cannot push to A frame document — rejected and doc untouched', async () => {
    const { db, tables } = await freshDb()
    const { POST } = await import('@/app/api/sync/push/route')
    const res = await POST(await pushRequest('b', {
      instanceId: 'inst-a', apiVersion: API_VERSION,
      changes: [{ idempotencyKey: 'k2', entityType: 'frame_document', entityId: 'inst-a', operation: 'upsert', payload: { v: 666 } }],
    }))
    const body = await res.json()
    expect(body.rejected?.length).toBe(1)
    expect(body.accepted ?? []).not.toContain('k2')
    const rows = await db.select().from(tables.frameDocuments)
    const a = (rows as any[]).find((r) => r.identifier === 'inst-a')
    expect(a.data.v).toBe(0)
  })

  it('instance B cannot delete A frame document', async () => {
    const { db, tables } = await freshDb()
    const { POST } = await import('@/app/api/sync/push/route')
    const res = await POST(await pushRequest('b', {
      instanceId: 'inst-a', apiVersion: API_VERSION,
      changes: [{ idempotencyKey: 'k3', entityType: 'frame_document', entityId: 'inst-a', operation: 'delete' }],
    }))
    const body = await res.json()
    expect(body.rejected?.length).toBe(1)
    const rows = await db.select().from(tables.frameDocuments)
    expect((rows as any[]).some((r) => r.identifier === 'inst-a')).toBe(true)
  })

  it('pull returns only the requesting instance document', async () => {
    await freshDb()
    const { GET } = await import('@/app/api/sync/pull/route')
    const res = await GET(await pullRequest('b', { instanceId: 'inst-b', apiVersion: API_VERSION }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const ids = (body.changes as any[]).map((c) => c.entityId)
    expect(ids).toEqual(['inst-b'])
    expect(ids).not.toContain('inst-a')
  })

  it('body instanceId is ignored; authenticated token decides identity', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/sync/push/route')
    // A authenticates but claims to be B in the body — must still act as A.
    const res = await POST(await pushRequest('a', {
      instanceId: 'inst-b', apiVersion: API_VERSION,
      changes: [{ idempotencyKey: 'k4', entityType: 'frame_document', entityId: 'inst-b', operation: 'upsert', payload: { v: 999 } }],
    }))
    const body = await res.json()
    expect(body.rejected?.length).toBe(1)
  })

  it('SYNC_SECRET dev bearer bypasses ownership outside production', async () => {
    env.SYNC_SECRET = 'dev-secret'
    try {
      const { POST } = await import('@/app/api/sync/push/route')
      const res = await POST(await pushRequest('secret', {
        apiVersion: API_VERSION,
        changes: [{ idempotencyKey: 'k5', entityType: 'frame_document', entityId: 'inst-a', operation: 'upsert', payload: { v: 42 } }],
      }))
      const body = await res.json()
      expect(body.accepted).toContain('k5')
    } finally {
      delete env.SYNC_SECRET
    }
  })
})
