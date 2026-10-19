import { getDatabaseMode } from '@/lib/db/mode'
import { getPending, markInflight, markDone, markFailed, pendingCount } from './queue'
import { API_VERSION } from './compat'

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

export async function pushPending(config: SyncConfig) {
  const pending = await getPending()
  if (!pending.length) return
  await markInflight(pending.map((p: any) => p.id))
  const changes = pending.map((p: any) => ({
    idempotencyKey: p.idempotencyKey,
    entityType: p.entityType,
    entityId: p.entityId,
    operation: p.operation,
    payload: p.payload,
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
    const doneIds = pending.filter((p: any) => accepted.has(p.idempotencyKey)).map((p: any) => p.id)
    await markDone(doneIds)
    for (const c of data.conflicts ?? []) {
      const item = pending.find((p: any) => p.idempotencyKey === c.idempotencyKey)
      if (item) await markFailed(item.id, `conflict: remote revision ${c.remoteRevision}`)
    }
  } catch (e: any) {
    lastError = String(e?.message ?? e)
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
      await mutateStore(() => c.payload as any, c.entityId)
    }
  }
  return data.cursor as string
}

export async function runSyncCycle(config: SyncConfig, checkpoint?: string) {
  if (running) return
  running = true
  try {
    await pushPending(config)
    const cursor = await pullRemote(config, checkpoint)
    lastSyncAt = new Date().toISOString()
    lastError = null
    return cursor
  } catch (e: any) {
    lastError = String(e?.message ?? e)
    throw e
  } finally {
    running = false
  }
}
