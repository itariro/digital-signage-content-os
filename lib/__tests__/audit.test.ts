import { describe, it, expect, beforeAll, vi } from 'vitest'

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

  it('swallows a writer error and logs the target without details', async () => {
    const { auditSafe } = await import('@/lib/audit')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const write = vi.fn(async () => { throw new Error('db down') })
    try {
      await auditSafe({
        actor: 'admin',
        action: 'enroll_redeemed',
        targetType: 'instance',
        targetId: 'i1',
        details: { secret: 'do-not-log' },
      }, write)
      expect(write).toHaveBeenCalledOnce()
      expect(spy).toHaveBeenCalledWith(
        'audit write failed',
        expect.objectContaining({ action: 'enroll_redeemed', targetType: 'instance', targetId: 'i1' }),
      )
      expect(JSON.stringify(spy.mock.calls[0][1])).not.toContain('do-not-log')
    } finally {
      spy.mockRestore()
    }
  })
})
