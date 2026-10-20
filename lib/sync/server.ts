import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { recordConflict } from './conflicts'

export interface PushChange {
  idempotencyKey: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: unknown
  baseRevision?: number
}

export interface PushOutcome {
  accepted: string[]
  conflicts: Array<{ idempotencyKey: string; entityType: string; entityId: string; localRevision: number; remoteRevision: number }>
  rejected: Array<{ idempotencyKey: string; entityId: string; reason: string }>
}

export interface PullOutcome {
  changes: Array<{ entityType: string; entityId: string; operation: 'upsert'; payload: unknown; revision: number; updatedAt: string }>
  cursor: string
  expired?: boolean
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** The SYNC_SECRET dev bearer ('dev-instance') sees everything outside production. */
function isDevBypass(authedInstanceId: string): boolean {
  return authedInstanceId === 'dev-instance' && process.env.NODE_ENV !== 'production'
}

/**
 * An instance may only touch the frame document registered for it: the
 * registration flow creates `frame_documents.identifier === instances.id`.
 */
export function canWriteEntity(authedInstanceId: string, entityId: string): boolean {
  if (isDevBypass(authedInstanceId)) return true
  return authedInstanceId === entityId
}

export async function handlePush(authedInstanceId: string, changes: PushChange[]): Promise<PushOutcome> {
  const db = getDb() as any
  const tables = getTables() as any
  const accepted: string[] = []
  const conflicts: PushOutcome['conflicts'] = []
  const rejected: PushOutcome['rejected'] = []

  for (const c of changes) {
    // Ownership first: a foreign entity is rejected and its idempotency key
    // is NOT burned, so a legitimate owner can still use it later.
    if (!canWriteEntity(authedInstanceId, c.entityId)) {
      rejected.push({ idempotencyKey: c.idempotencyKey, entityId: c.entityId, reason: 'not_owned' })
      continue
    }

    const existingKey = await db.select().from(tables.idempotencyKeys).where(eq(tables.idempotencyKeys.key, c.idempotencyKey))
    if (existingKey.length) {
      accepted.push(c.idempotencyKey)
      continue
    }

    if (c.entityType === 'frame_document' && c.operation === 'upsert') {
      const [remote] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
      const remoteRev: number = remote?.revision ?? 0
      // Interim rule until the baseRevision protocol lands (Task 6): clients
      // that do not declare a baseRevision push authoritatively; divergence
      // is only detectable when baseRevision is provided.
      if (remote && c.baseRevision !== undefined && remoteRev > c.baseRevision) {
        const cf = await recordConflict({
          instanceId: authedInstanceId,
          entityType: c.entityType,
          entityId: c.entityId,
          localRevision: c.baseRevision,
          remoteRevision: remoteRev,
          localPayload: c.payload,
          remotePayload: remote.data,
        })
        conflicts.push({ idempotencyKey: c.idempotencyKey, entityType: c.entityType, entityId: c.entityId, localRevision: cf.localRevision, remoteRevision: cf.remoteRevision })
        // Do not store the key for conflicted changes: the client must retry
        // after resolving; burning the key would silently drop the change.
        continue
      }
      const now = new Date()
      if (remote) {
        await db.update(tables.frameDocuments).set({ data: c.payload, updatedAt: now, revision: remoteRev + 1 }).where(eq(tables.frameDocuments.identifier, c.entityId))
      } else {
        await db.insert(tables.frameDocuments).values({
          id: c.entityId, identifier: c.entityId, name: (c.payload as any)?.name ?? c.entityId,
          data: c.payload, createdAt: now, updatedAt: now, revision: 1,
        })
      }
    } else if (c.entityType === 'frame_document' && c.operation === 'delete') {
      await db.delete(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
    }

    await db.insert(tables.idempotencyKeys).values({ key: c.idempotencyKey, createdAt: new Date() })
    accepted.push(c.idempotencyKey)
  }

  return { accepted, conflicts, rejected }
}

/**
 * Pull only the requesting instance's own document, filtered server-side.
 * `since` is an ISO timestamp cursor; beyond 7 days the console can no longer
 * guarantee completeness and signals `expired` so the client does a full resync.
 */
export async function handlePull(authedInstanceId: string, since?: string): Promise<PullOutcome> {
  const db = getDb() as any
  const tables = getTables() as any

  let sinceDate: Date | null = null
  if (since) {
    const parsed = new Date(since)
    if (!Number.isNaN(parsed.getTime())) {
      if (Date.now() - parsed.getTime() > SEVEN_DAYS_MS) {
        return { changes: [], cursor: new Date().toISOString(), expired: true }
      }
      sinceDate = parsed
    }
  }

  const conditions = []
  if (!isDevBypass(authedInstanceId)) conditions.push(eq(tables.frameDocuments.identifier, authedInstanceId))
  if (sinceDate) conditions.push(gt(tables.frameDocuments.updatedAt, sinceDate))
  const rows = conditions.length
    ? await db.select().from(tables.frameDocuments).where(and(...conditions))
    : await db.select().from(tables.frameDocuments)

  const changes = (rows as any[]).map((r) => ({
    entityType: 'frame_document',
    entityId: r.identifier,
    operation: 'upsert' as const,
    payload: r.data,
    revision: r.revision ?? 1,
    updatedAt: new Date(r.updatedAt).toISOString(),
  }))

  const latest = changes.reduce((acc: number, c) => Math.max(acc, new Date(c.updatedAt).getTime()), 0)
  const cursor = latest ? new Date(latest).toISOString() : new Date().toISOString()

  return { changes, cursor }
}
