import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-library'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('canvas library helpers', () => {
  it('recognises only the reserved id', async () => {
    const { CANVAS_LIBRARY_ID, isLibraryFrame } = await import('@/lib/canvas/library')
    expect(CANVAS_LIBRARY_ID).toBe('canvas-library')
    expect(isLibraryFrame('canvas-library')).toBe(true)
    expect(isLibraryFrame('canvas-library ')).toBe(false)
    expect(isLibraryFrame('home')).toBe(false)
    expect(isLibraryFrame(undefined)).toBe(false)
  })

  it('creates an empty console-only library document once', async () => {
    await freshDb()
    const { CANVAS_LIBRARY_ID, ensureCanvasLibrary } = await import('@/lib/canvas/library')
    const first = await ensureCanvasLibrary()
    expect(first.layouts).toEqual([])
    expect(first.albums).toEqual([])
    expect(first.activeId).toBeNull()
    expect(first.schedule.enabled).toBe(false)
    expect(first.schedule.rules).toEqual([])
    expect(first.experiences.enabled).toBe(false)
    expect(first.experiences.rules).toEqual([])

    const second = await ensureCanvasLibrary()
    expect(second).toEqual(first)

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const rows = await getDb().select().from(getTables().frameDocuments).where(
      eq(getTables().frameDocuments.identifier, CANVAS_LIBRARY_ID),
    )
    expect(rows).toHaveLength(1)
  })
})
