import { describe, it, expect, beforeAll } from 'vitest'

describe('runMigrations', () => {
  beforeAll(() => {
    process.env.FRAME_MODE = 'instance'
    process.env.FRAME_DB_PATH = ':memory:'
  })
  it('creates core tables on empty sqlite db', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { getSqliteRaw } = await import('@/lib/db/sqlite')
    const db = getSqliteRaw()
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const names = rows.map((r: any) => r.name)
    expect(names).toContain('frame_documents')
    expect(names).toContain('assets')
    expect(names).toContain('sync_queue')
  })
})
