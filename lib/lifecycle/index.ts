import { getDatabaseMode } from '@/lib/db/mode'

async function checkIntegrity(): Promise<boolean> {
  try {
    const { getSqliteRaw } = await import('@/lib/db/sqlite')
    const db = getSqliteRaw()
    const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined
    if (!row) return false
    return Object.values(row)[0] === 'ok'
  } catch (e: unknown) {
    console.error('sqlite integrity check errored:', e)
    return false
  }
}

/**
 * Spec §6/§4.2 order on every boot (sqlite instances):
 * 1. integrity check — a corrupt file must not be snapshot over good backups;
 * 2. corrupt → restore the latest backup (explicit failure when none);
 * 3. healthy → snapshot before migrating (rotation keeps BACKUP_MAX);
 * 4. versioned migrations run.
 */
async function guardDatabase() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  const fs = await import('node:fs')
  const { dbFilePath } = await import('@/lib/backup')

  if (!fs.existsSync(dbFilePath())) {
    // fresh install: nothing to check or protect yet
    return
  }

  if (!(await checkIntegrity())) {
    console.error('database failed integrity check; attempting restore from latest backup')
    resetSqliteDb()
    const { restoreLatestBackup } = await import('@/lib/backup')
    const restored = restoreLatestBackup()
    if (!restored) throw new Error('database corrupt and no backup available for restore')
    if (!(await checkIntegrity())) throw new Error('database corrupt after backup restore')
    console.error('restored database from latest backup')
    return
  }

  try {
    const { snapshotIfPopulated } = await import('@/lib/backup')
    snapshotIfPopulated()
  } catch (e: unknown) {
    console.error('pre-migration snapshot failed:', e)
  }
}

export async function initInstance() {
  if (getDatabaseMode() === 'sqlite') {
    await guardDatabase()
  }
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  // Start sync worker if configured (non-blocking).
  if (process.env.SYNC_ENABLED !== 'false' && process.env.SYNC_ENDPOINT && process.env.SYNC_TOKEN && process.env.INSTANCE_ID) {
    try {
      const { startSyncWorker } = await import('@/lib/sync/worker')
      startSyncWorker(
        { endpoint: process.env.SYNC_ENDPOINT, token: process.env.SYNC_TOKEN, instanceId: process.env.INSTANCE_ID },
        Number(process.env.SYNC_INTERVAL_MINUTES) || 15,
      )
    } catch (e: unknown) {
      console.error('sync worker failed to start:', e)
    }
  }
}

export async function shutdownInstance() {
  try {
    const { stopSyncWorker } = await import('@/lib/sync/worker')
    stopSyncWorker()
  } catch (e: unknown) {
    console.error('sync worker stop failed:', e)
  }
  if (getDatabaseMode() === 'sqlite') {
    try {
      const { getSqliteRaw } = await import('@/lib/db/sqlite')
      const db = getSqliteRaw()
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e: unknown) {
      console.error('shutdown wal checkpoint failed:', e)
    }
  }
}
