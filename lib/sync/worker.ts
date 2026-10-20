import { getDatabaseMode } from '@/lib/db/mode'
import type { SyncConfig } from './client'
import { runSyncCycle } from './client'

let timer: ReturnType<typeof setInterval> | null = null

export function startSyncWorker(config: SyncConfig, intervalMinutes: number) {
  if (getDatabaseMode() !== 'sqlite') return
  if (timer) return
  const ms = Math.max(1, intervalMinutes) * 60 * 1000
  timer = setInterval(() => {
    runSyncCycle(config).catch((e: unknown) => console.error('sync cycle failed:', e))
  }, ms)
  runSyncCycle(config).catch((e: unknown) => console.error('initial sync cycle failed:', e))
}

export function stopSyncWorker() {
  if (timer) { clearInterval(timer); timer = null }
}
