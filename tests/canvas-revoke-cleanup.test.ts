import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const cleanup = vi.hoisted(() => ({ fail: false }))

vi.mock('@/lib/canvas/state-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/canvas/state-store')>()
  return {
    ...actual,
    deleteCanvasState: async (id: string) => {
      if (cleanup.fail) throw new Error('cleanup failed')
      await actual.deleteCanvasState(id)
    },
  }
})

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = process.env.NODE_ENV

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-revoke-cleanup'
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = originalNodeEnv
  delete env.CONSOLE_ADMIN_TOKEN
  cleanup.fail = false
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seedInstance(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb()
  const tables = getTables()
  const now = new Date()
  await db.insert(tables.instances).values({ id, createdAt: now, lastSeenAt: now })
}

async function deleteInstance(id: string) {
  const { NextRequest } = await import('next/server')
  const { DELETE } = await import('@/app/api/instances/[id]/route')
  const request = new NextRequest(`http://localhost/api/instances/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': 'revoke-admin' },
  })
  return DELETE(request, { params: Promise.resolve({ id }) })
}

describe('instance revoke cleanup', () => {
  beforeEach(async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'revoke-admin'
    await freshDb()
  })

  it('deletes the canvas_state row when an instance is revoked', async () => {
    await seedInstance('frame-r')
    const { putCanvasState, getCanvasState } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-r', { v: 1, active: null, pending: null, identify: null })
    expect(await getCanvasState('frame-r')).not.toBeNull()

    const response = await deleteInstance('frame-r')
    expect(response.status).toBe(200)
    expect(await getCanvasState('frame-r')).toBeNull()
  })

  it('succeeds when the instance has no canvas_state row', async () => {
    await seedInstance('frame-s')
    const response = await deleteInstance('frame-s')
    expect(response.status).toBe(200)
  })

  it('keeps the revoke outcome and audit when canvas cleanup fails', async () => {
    await seedInstance('frame-t')
    cleanup.fail = true

    const response = await deleteInstance('frame-t')
    expect(response.status).toBe(200)

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const logs = await getDb().select().from(getTables().auditLog)
    expect(logs.some((log) => log.action === 'revoke_instance' && log.targetId === 'frame-t')).toBe(true)
  })
})
