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
  // Start sync worker if configured (non-blocking).
  if (process.env.SYNC_ENABLED !== 'false' && process.env.SYNC_ENDPOINT && process.env.SYNC_TOKEN && process.env.INSTANCE_ID) {
    try {
      const { startSyncWorker } = await import('@/lib/sync/worker')
      startSyncWorker(
        { endpoint: process.env.SYNC_ENDPOINT, token: process.env.SYNC_TOKEN, instanceId: process.env.INSTANCE_ID },
        Number(process.env.SYNC_INTERVAL_MINUTES) || 15,
      )
    } catch {}
  }
}

export async function shutdownInstance() {
  try {
    const { stopSyncWorker } = await import('@/lib/sync/worker')
    stopSyncWorker()
  } catch {}
  if (getDatabaseMode() === 'sqlite') {
    try {
      const { getSqliteRaw } = await import('@/lib/db/sqlite')
      const db = getSqliteRaw() as any
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {}
  }
}
