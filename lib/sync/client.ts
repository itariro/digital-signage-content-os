import { getDatabaseMode } from '@/lib/db/mode'
import { getPending, markInflight, markDone, markFailed, markConflict, conflictCount, pendingCount } from './queue'
import { API_VERSION } from './compat'
import { localFrameId } from './ids'

export interface SyncConfig {
  endpoint: string
  token: string
  instanceId: string
}

let lastSyncAt: string | null = null
let lastError: string | null = null
let running = false

export function getSyncState() {
  return { lastSyncAt, lastError, running }
}

async function loadCheckpoint(instanceId: string): Promise<string | undefined> {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const { syncCheckpoints } = getTables()
  const [row] = await db.select().from(syncCheckpoints).where(eq(syncCheckpoints.id, instanceId))
  return row?.cursor ?? undefined
}

async function saveCheckpoint(instanceId: string, cursor: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb()
  const { syncCheckpoints } = getTables()
  const now = new Date()
  await db.insert(syncCheckpoints)
    .values({ id: instanceId, scope: 'pull', cursor, updatedAt: now })
    .onConflictDoUpdate({ target: syncCheckpoints.id, set: { cursor, updatedAt: now } })
}

export async function pushPending(config: SyncConfig) {
  const pending = await getPending()
  if (!pending.length) return
  await markInflight(pending.map((p) => p.id))
  const changes = pending.map((p) => ({
    idempotencyKey: p.idempotencyKey,
    entityType: p.entityType,
    entityId: p.entityId,
    operation: p.operation,
    payload: p.payload,
    baseRevision: p.baseRevision ?? undefined,
  }))
  try {
    const res = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ instanceId: config.instanceId, apiVersion: API_VERSION, changes }),
    })
    if (!res.ok) throw new Error(`push failed: ${res.status}`)
    const data = await res.json()
    const accepted = new Set(data.accepted ?? [])
    const doneIds = pending.filter((p) => accepted.has(p.idempotencyKey)).map((p) => p.id)
    await markDone(doneIds)
    for (const c of data.conflicts ?? []) {
      const item = pending.find((p) => p.idempotencyKey === c.idempotencyKey)
      // Terminal 'conflict' state: kept for visibility, retried only after
      // resolution — never markFailed, which would retry forever with a key
      // the server will keep refusing.
      if (item) await markConflict(item.id, `conflict: remote revision ${c.remoteRevision}`)
    }
    for (const r of data.rejected ?? []) {
      const item = pending.find((p) => p.idempotencyKey === r.idempotencyKey)
      if (item) await markConflict(item.id, `rejected: ${r.reason}`)
    }
  } catch (e: unknown) {
    lastError = e instanceof Error ? e.message : String(e)
    for (const p of pending) await markFailed(p.id, lastError)
    throw e
  }
}

export async function pullRemote(config: SyncConfig, since?: string, retried = false) {
  const url = new URL(`${config.endpoint.replace(/\/$/, '')}/api/sync/pull`)
  url.searchParams.set('instanceId', config.instanceId)
  if (since) url.searchParams.set('since', since)
  url.searchParams.set('apiVersion', API_VERSION)
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${config.token}` } })
  if (res.status === 410 && !retried) {
    return pullRemote(config, undefined, true)
  }
  if (!res.ok) throw new Error(`pull failed: ${res.status}`)
  const data = await res.json()
  const { mutateStore } = await import('@/lib/store')
  for (const c of data.changes ?? []) {
    if (c.entityType === 'frame_document' && c.operation === 'upsert') {
      await mutateStore(() => c.payload as import('@/lib/types').FrameStore, localFrameId(c.entityId), { source: 'remote', revision: c.revision })
    }
  }
  // Console-resolved conflicts retire the instance's terminal queue rows.
  for (const rc of data.resolvedConflicts ?? []) {
    const { discardConflictsFor } = await import('./queue')
    await discardConflictsFor(rc.entityId)
  }
  return data.cursor as string
}

export async function runSyncCycle(config: SyncConfig, checkpoint?: string) {
  if (running) return
  running = true
  try {
    await pushPending(config)
    const since = checkpoint ?? await loadCheckpoint(config.instanceId)
    const cursor = await pullRemote(config, since)
    if (cursor) await saveCheckpoint(config.instanceId, cursor)
    lastSyncAt = new Date().toISOString()
    lastError = null
    return cursor
  } catch (e: unknown) {
    lastError = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    running = false
  }
}
