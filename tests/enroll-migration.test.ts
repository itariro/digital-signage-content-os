import { describe, it, expect, beforeAll } from 'vitest'

// The enrollment_codes table must exist after runMigrations() on a fresh
// sqlite instance AND be reachable through getTables() (both dialects share
// the query API). Mirrors tests/kiosk-bootstrap.test.ts env setup.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/enroll-mig'
})

describe('enrollment_codes migration', () => {
  it('exists on a fresh sqlite instance and accepts an insert', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const t = getTables()
    await getDb().insert(t.enrollmentCodes).values({
      codeHash: 'h1', instanceId: 'i1',
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    })
    const rows = await getDb().select().from(t.enrollmentCodes)
    expect(rows).toHaveLength(1)
    expect(rows[0].instanceId).toBe('i1')
  })
})
