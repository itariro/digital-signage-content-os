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
}) {
  const db = getDb() as any
  const { syncConflicts } = getTables() as any
  const row = {
    id: nanoid(12),
    instanceId: input.instanceId,
    entityType: input.entityType,
    entityId: input.entityId,
    localRevision: input.localRevision,
    remoteRevision: input.remoteRevision,
    localPayload: input.localPayload ?? null,
    remotePayload: input.remotePayload ?? null,
    status: 'open',
    createdAt: new Date(),
  }
  await db.insert(syncConflicts).values(row)
  return row
}

export async function listConflicts(instanceId?: string) {
  const db = getDb() as any
  const { syncConflicts } = getTables() as any
  if (instanceId) {
    return db.select().from(syncConflicts).where(eq(syncConflicts.instanceId, instanceId))
  }
  return db.select().from(syncConflicts)
}

export async function resolveConflict(id: string, resolution: 'local' | 'remote', appliedBy?: string) {
  const db = getDb() as any
  const { syncConflicts } = getTables() as any
  const rows = await db.select().from(syncConflicts).where(eq(syncConflicts.id, id))
  const conflict = rows[0]
  if (!conflict || conflict.status !== 'open') return null
  if (resolution === 'local') {
    // The instance's version wins: write its payload as the authoritative
    // document content and bump the revision so peers pull it.
    const { frameDocuments } = getTables() as any
    const [doc] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, conflict.entityId))
    if (doc) {
      await db.update(frameDocuments)
        .set({ data: conflict.localPayload, updatedAt: new Date(), revision: (doc.revision ?? 1) + 1, updatedBy: appliedBy ?? 'conflict-resolution' })
        .where(eq(frameDocuments.identifier, conflict.entityId))
    }
  }
  await db.update(syncConflicts).set({ status: resolution }).where(eq(syncConflicts.id, id))
  return { ...conflict, status: resolution }
}
