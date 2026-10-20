import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'

// Task 10: enqueue must follow the mode RESOLVER (sqlite), not a raw
// FRAME_MODE==='instance' env compare; config push must validate the patch
// and apply atomically, keeping the last-known-good doc on rejection (§9).
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/config-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function docRow(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb() as any
  const tables = getTables() as any
  const [row] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  return row
}

describe('resolver-gated enqueue', () => {
  it('enqueues when the mode resolves to sqlite with FRAME_MODE unset', async () => {
    await freshDb()
    delete env.FRAME_MODE
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.customFonts.push('resolver-1') }, 'home')
    const { getPending } = await import('@/lib/sync/queue')
    expect((await getPending()).length).toBe(1)
  })
})

describe('config push validation', () => {
  const ORIGINAL_FETCH = globalThis.fetch
  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

  async function postConfig(id: string, body: unknown) {
    const { NextRequest } = await import('next/server')
    const { POST } = await import('@/app/api/instances/[id]/config/route')
    const req = new NextRequest(`http://localhost/api/instances/${id}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'cfg-admin' },
      body: JSON.stringify(body),
    })
    return POST(req, { params: Promise.resolve({ id }) })
  }

  async function seedDoc(id: string) {
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = getDb() as any
    const tables = getTables() as any
    await db.insert(tables.frameDocuments).values({
      id, identifier: id, name: id, data: { customFonts: ['good'], activeId: null, layouts: [], presets: [], schedule: {}, albums: [], experiences: {} },
      createdAt: new Date(), updatedAt: new Date(), revision: 4,
    })
  }

  it('rejects an unknown top-level key with 400 and leaves the doc untouched', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'cfg-admin'
    await freshDb()
    await seedDoc('cfg1')
    const res = await postConfig('cfg1', { evilKey: { drop: true } })
    expect(res.status).toBe(400)
    const doc = await docRow('cfg1')
    expect((doc.data as any).customFonts).toEqual(['good'])
    expect(doc.revision).toBe(4)
    delete env.NODE_ENV
    delete env.CONSOLE_ADMIN_TOKEN
  })

  it('rejects a wrongly-typed known field with 400 (customFonts: string)', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'cfg-admin'
    await freshDb()
    await seedDoc('cfg2')
    const res = await postConfig('cfg2', { customFonts: 'not-an-array' })
    expect(res.status).toBe(400)
    const doc = await docRow('cfg2')
    expect((doc.data as any).customFonts).toEqual(['good'])
    delete env.NODE_ENV
    delete env.CONSOLE_ADMIN_TOKEN
  })

  it('applies a valid patch through the serialized store path, bumping revision', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'cfg-admin'
    await freshDb()
    await seedDoc('cfg3')
    const res = await postConfig('cfg3', { customFonts: ['patched'] })
    expect(res.status).toBe(200)
    const doc = await docRow('cfg3')
    expect((doc.data as any).customFonts).toEqual(['patched'])
    expect(doc.revision).toBe(5) // bumped so the instance pulls it
    delete env.NODE_ENV
    delete env.CONSOLE_ADMIN_TOKEN
    delete env.FRAME_MODE
  })

  it('rejects the patch when the instance does not exist', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'cfg-admin'
    await freshDb()
    const res = await postConfig('ghost', { customFonts: ['x'] })
    expect(res.status).toBe(404)
    delete env.NODE_ENV
    delete env.CONSOLE_ADMIN_TOKEN
  })
})
