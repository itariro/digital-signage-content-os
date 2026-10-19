import { describe, it, expect, beforeAll } from 'vitest'

describe('audit', () => {
  beforeAll(() => {
    process.env.FRAME_MODE = 'instance'
    process.env.FRAME_DB_PATH = ':memory:'
    const fs = require('node:fs')
    fs.mkdirSync('/tmp/scratchpad/adata', { recursive: true })
    process.env.FRAME_DATA_DIR = '/tmp/scratchpad/adata'
  })
  it('records and lists entries', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { audit, listAudit } = await import('@/lib/audit')
    await audit('admin', 'test_action', 'instance', 'i1', { foo: 1 })
    const rows = await listAudit(10)
    expect(rows.length).toBe(1)
    expect(rows[0].action).toBe('test_action')
  })
})
