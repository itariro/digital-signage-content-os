import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

export async function recordConflict(input: {
  instanceId: string
  entityType: string
  entityId: string
  localRevision: number
  remoteRevision: number
  localPayload?: unknown
  remotePayload?: unknown
  status?: 'open' | 'rejected'
}) {
  const db = getDb()
  const { syncConflicts } = getTables()
  const row = {
    id: nanoid(12),
    instanceId: input.instanceId,
    entityType: input.entityType,
    entityId: input.entityId,
    localRevision: input.localRevision,
    remoteRevision: input.remoteRevision,
    localPayload: input.localPayload ?? null,
    remotePayload: input.remotePayload ?? null,
    status: input.status ?? 'open',
    createdAt: new Date(),
  }
  await db.insert(syncConflicts).values(row)
  return row
}

export async function listConflicts(instanceId?: string) {
  const db = getDb()
  const { syncConflicts } = getTables()
  if (instanceId) {
    return db.select().from(syncConflicts).where(eq(syncConflicts.instanceId, instanceId))
  }
  return db.select().from(syncConflicts)
}

export async function resolveConflict(id: string, resolution: 'local' | 'remote' | 'discard', appliedBy?: string) {
  const db = getDb()
  const { syncConflicts } = getTables()
  const rows = await db.select().from(syncConflicts).where(eq(syncConflicts.id, id))
  const conflict = rows[0]
  if (!conflict || (conflict.status !== 'open' && conflict.status !== 'rejected')) return null
  if (resolution === 'discard') {
    // only rejected (never-delivered) changes are discardable
    if (conflict.status !== 'rejected') return null
    await db.update(syncConflicts).set({ status: 'discarded' }).where(eq(syncConflicts.id, id))
    return { ...conflict, status: 'discarded' }
  }
  // a rejected write from a single-frame kiosk is not registerable; discard it
  if (conflict.status === 'rejected') return null
  const { frameDocuments } = getTables()
  const [doc] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, conflict.entityId))
  if (resolution === 'local') {
    // The instance's version wins: write its payload as the authoritative
    // document content and bump the revision so peers pull it.
    if (doc) {
      await db.update(frameDocuments)
        .set({ data: conflict.localPayload, updatedAt: new Date(), revision: (doc.revision ?? 1) + 1, updatedBy: appliedBy ?? 'conflict-resolution' })
        .where(eq(frameDocuments.identifier, conflict.entityId))
    }
  } else {
    // 'remote' (console version wins): the doc content stands, but its
    // updatedAt may sit BEHIND the instance's pull cursor (the conflicted
    // push never touched it) — re-touch so the next pull re-delivers it and
    // the kiosk actually converges on the operator's choice (I-1).
    if (doc) {
      await db.update(frameDocuments)
        .set({ updatedAt: new Date(), updatedBy: appliedBy ?? 'conflict-resolution' })
        .where(eq(frameDocuments.identifier, conflict.entityId))
    }
  }
  await db.update(syncConflicts).set({ status: resolution }).where(eq(syncConflicts.id, id))
  return { ...conflict, status: resolution }
}
