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

export async function resolveConflict(id: string, resolution: 'local' | 'remote' | 'merged') {
  const db = getDb() as any
  const { syncConflicts } = getTables() as any
  await db.update(syncConflicts).set({ status: resolution }).where(eq(syncConflicts.id, id))
}
