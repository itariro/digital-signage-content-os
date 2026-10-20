import { describe, it, expect, beforeAll, afterEach } from 'vitest'

// Final review C-1: a device bearer token must NOT act as a console-admin
// credential (config push/asset delete/conflict resolve are operator
// surfaces). SYNC_SECRET dev bypass must be dead in production, and the
// comparison constant-time.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/authz2-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { hashToken } = await import('@/lib/sync/auth')
  const tables = getTables()
  const now = new Date()
  await getDb().insert(tables.instances).values({ id: 'dev-a', deviceTokenHash: hashToken('dev-a-token'), createdAt: now })
  await getDb().insert(tables.frameDocuments).values({
    id: 'dev-a', identifier: 'dev-a', name: 'dev-a', data: { v: 1 },
    createdAt: now, updatedAt: now, revision: 1,
  })
}

async function bearerReq(url: string, token: string, body?: unknown) {
  const { NextRequest } = await import('next/server')
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

afterEach(() => {
  delete env.NODE_ENV
  delete env.CONSOLE_ADMIN_TOKEN
  delete env.SYNC_SECRET
})

describe('device bearer is not a console-admin credential', () => {
  it('config push with a device token is 401 even when the token is valid AND targets self', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'op-admin'
    await freshDb()
    const { POST } = await import('@/app/api/instances/[id]/config/route')
    const res = await POST(await bearerReq('http://x/api/instances/dev-a/config', 'dev-a-token', { customFonts: ['a'] }), { params: Promise.resolve({ id: 'dev-a' }) })
    expect(res.status).toBe(401)
  })

  it('conflict resolve with a device token is 401', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'op-admin'
    await freshDb()
    const { POST } = await import('@/app/api/sync/conflicts/[id]/resolve/route')
    const req = await bearerReq('http://x/api/sync/conflicts/nope/resolve', 'dev-a-token')
    const res = await POST(req as never, { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(401)
  })

  it('asset delete with a device token is 401', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'op-admin'
    await freshDb()
    const { DELETE } = await import('@/app/api/assets/[id]/route')
    const { NextRequest } = await import('next/server')
    const res = await DELETE(new NextRequest('http://x/api/assets/nope', { method: 'DELETE', headers: { Authorization: 'Bearer dev-a-token' } }), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(401)
  })

  it('SYNC_SECRET bearer is rejected outright in production', async () => {
    env.NODE_ENV = 'production'
    env.SYNC_SECRET = 's3cret'
    await freshDb()
    const { authenticateInstance } = await import('@/lib/sync/auth')
    const req = await bearerReq('http://x/api/sync/push', 's3cret')
    expect(await authenticateInstance(req)).toBeNull()
  })

  it('SYNC_SECRET bearer still works outside production', async () => {
    env.NODE_ENV = 'development'
    env.SYNC_SECRET = 's3cret'
    await freshDb()
    const { authenticateInstance } = await import('@/lib/sync/auth')
    const req = await bearerReq('http://x/api/sync/push', 's3cret')
    expect(await authenticateInstance(req)).toBe('dev-instance')
  })
})
