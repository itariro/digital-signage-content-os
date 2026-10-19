import { getDatabaseMode } from '@/lib/db/mode'

export async function initInstance() {
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  if (getDatabaseMode() === 'sqlite') {
    const { getSqliteRaw } = await import('@/lib/db/sqlite')
    const db = getSqliteRaw() as any
    const row = db.prepare('PRAGMA integrity_check').get()
    const ok = row && Object.values(row)[0] === 'ok'
    if (!ok) throw new Error('SQLite integrity check failed')
  }
}

export async function shutdownInstance() {
  if (getDatabaseMode() === 'sqlite') {
    try {
      const { getSqliteRaw } = await import('@/lib/db/sqlite')
      const db = getSqliteRaw() as any
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {}
  }
}
