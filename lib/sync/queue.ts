import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { nextRetryDelay } from '@/lib/kiosk/sync'
import type { EnqueueInput } from './types'

export async function enqueueChange(input: EnqueueInput) {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const now = new Date()
  await db.insert(syncQueue).values({
    id: nanoid(12),
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    baseRevision: input.baseRevision ?? null,
  })
}

export async function getPending(limit = 50) {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const rows = await db.select().from(syncQueue).where(eq(syncQueue.status, 'pending'))
  const now = Date.now()
  const eligible = (rows as any[]).filter((r) => new Date(r.nextAttemptAt).getTime() <= now)
  return eligible.slice(0, limit)
}

export async function markInflight(ids: string[]) {
  if (!ids.length) return
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  for (const id of ids) {
    await db.update(syncQueue).set({ status: 'inflight' }).where(eq(syncQueue.id, id))
  }
}

export async function markDone(ids: string[]) {
  if (!ids.length) return
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  for (const id of ids) {
    await db.delete(syncQueue).where(eq(syncQueue.id, id))
  }
}

export async function markFailed(id: string, error: string) {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const rows = await db.select().from(syncQueue).where(eq(syncQueue.id, id))
  const r = rows[0]
  if (!r) return
  const attempts = (r.attempts ?? 0) + 1
  const delay = nextRetryDelay(attempts - 1)
  await db.update(syncQueue).set({ status: 'pending', attempts, nextAttemptAt: new Date(Date.now() + delay) }).where(eq(syncQueue.id, id))
}

/**
 * Terminal state for rejected/conflicted changes: the row is KEPT (the local
 * edit is never silently dropped) and leaves the retry loop until resolution.
 */
export async function markConflict(id: string, _error: string) {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  await db.update(syncQueue).set({ status: 'conflict' }).where(eq(syncQueue.id, id))
}

export async function conflictCount() {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const rows = await db.select().from(syncQueue).where(eq(syncQueue.status, 'conflict'))
  return (rows as any[]).length
}

export async function pendingCount() {
  const db = getDb() as any
  const { syncQueue } = getTables() as any
  const rows = await db.select().from(syncQueue).where(eq(syncQueue.status, 'pending'))
  return (rows as any[]).length
}
