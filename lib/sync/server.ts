import { and, eq, gt } from 'drizzle-orm'
import { getDb, type Database } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
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
  resolvedConflicts: Array<{ entityId: string; resolution: string }>
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** The SYNC_SECRET dev bearer ('dev-instance') sees everything outside production. */
function isDevBypass(authedInstanceId: string): boolean {
  return authedInstanceId === 'dev-instance' && process.env.NODE_ENV !== 'production'
}

/**
 * A kiosk instance manages EXACTLY ONE frame: its own document, keyed by the
 * instance id (the local home frame is translated to this id at the sync
 * boundary, lib/sync/ids.ts). Multi-frame lives on the console side — one
 * instance per screen. Stray writes are rejected AND recorded (below) so no
 * queue row can park invisibly.
 */
export function canWriteEntity(authedInstanceId: string, entityId: string): boolean {
  if (isDevBypass(authedInstanceId)) return true
  return entityId === authedInstanceId
}

export async function handlePush(authedInstanceId: string, changes: PushChange[]): Promise<PushOutcome> {
  const db = getDb()
  const tables = getTables()
  const accepted: string[] = []
  const conflicts: PushOutcome['conflicts'] = []
  const rejected: PushOutcome['rejected'] = []

  for (const c of changes) {
    // Ownership first: a foreign entity is rejected and its idempotency key
    // is NOT burned, so a legitimate owner can still use it later.
    if (!canWriteEntity(authedInstanceId, c.entityId)) {
      rejected.push({ idempotencyKey: c.idempotencyKey, entityId: c.entityId, reason: 'not_owned' })
      // Surface rejections too (C-3): otherwise a queue row parks in
      // 'conflict' with nothing visible on the console to explain it.
      if (c.entityType === 'frame_document') {
        const open = await db.select().from(tables.syncConflicts).where(eq(tables.syncConflicts.entityId, c.entityId))
        if (!open.some((r) => r.instanceId === authedInstanceId && (r.status === 'open' || r.status === 'rejected'))) {
          await recordConflict({
            instanceId: authedInstanceId,
            entityType: c.entityType,
            entityId: c.entityId,
            localRevision: c.baseRevision ?? 0,
            remoteRevision: 0,
            localPayload: c.payload,
            remotePayload: null,
            status: 'rejected',
          })
        }
      }
      continue
    }

    const existingKey = await db.select().from(tables.idempotencyKeys).where(eq(tables.idempotencyKeys.key, c.idempotencyKey))
    if (existingKey.length) {
      accepted.push(c.idempotencyKey)
      continue
    }

    let remote: (typeof tables.frameDocuments.$inferSelect) | undefined
    let remoteRev = 0
    if (c.entityType === 'frame_document' && c.operation === 'upsert') {
      const [row] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
      remote = row
      remoteRev = row?.revision ?? 0
      // Conflict only on genuine divergence: the client declares the revision
      // its edit builds on and the console must not have moved beyond it.
      // Clients without a baseRevision push authoritatively (legacy/dev).
      if (row && c.baseRevision !== undefined && remoteRev > c.baseRevision) {
        const cf = await recordConflict({
          instanceId: authedInstanceId,
          entityType: c.entityType,
          entityId: c.entityId,
          localRevision: c.baseRevision,
          remoteRevision: remoteRev,
          localPayload: c.payload,
          remotePayload: row.data,
        })
        conflicts.push({ idempotencyKey: c.idempotencyKey, entityType: c.entityType, entityId: c.entityId, localRevision: cf.localRevision, remoteRevision: cf.remoteRevision })
        // Do not store the key for conflicted changes: the client must retry
        // after resolving; burning the key would silently drop the change.
        continue
      }
    }

    const now = new Date()
    // Doc write and idempotency-key insert commit together: a crash between
    // them previously left the change applied but the key unburned, so the
    // client's retry (same baseRevision) saw a bumped remote revision and
    // recorded a FALSE conflict (final review I-4). On Postgres that pairing
    // runs in a transaction; better-sqlite3 cannot suspend a transaction
    // across awaits, so the local-dev console commits statements as they go
    // (acceptable there: the console IS the app process).
    const apply = async (exec: Database) => {
      if (c.entityType === 'frame_document' && c.operation === 'upsert') {
        if (remote) {
          await exec.update(tables.frameDocuments).set({ data: c.payload, updatedAt: now, revision: remoteRev + 1 }).where(eq(tables.frameDocuments.identifier, c.entityId))
        } else {
          await exec.insert(tables.frameDocuments).values({
            id: c.entityId, identifier: c.entityId, name: (c.payload as { name?: string } | undefined)?.name ?? c.entityId,
            data: c.payload, createdAt: now, updatedAt: now, revision: 1,
          })
        }
      } else if (c.entityType === 'frame_document' && c.operation === 'delete') {
        await exec.delete(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
      }
      await exec.insert(tables.idempotencyKeys).values({ key: c.idempotencyKey, createdAt: new Date() })
    }
    try {
      if (getDatabaseMode() === 'postgres') {
        await db.transaction(async (tx) => apply(tx))
      } else {
        await apply(db)
      }
      accepted.push(c.idempotencyKey)
    } catch (e: unknown) {
      console.error('sync apply failed for change', c.idempotencyKey, e)
      rejected.push({ idempotencyKey: c.idempotencyKey, entityId: c.entityId, reason: 'apply_error' })
    }
  }

  return { accepted, conflicts, rejected }
}

/**
 * Pull only the requesting instance's own document, filtered server-side.
 * `since` is an ISO timestamp cursor; beyond 7 days the console can no longer
 * guarantee completeness and signals `expired` so the client does a full resync.
 */
export async function handlePull(authedInstanceId: string, since?: string): Promise<PullOutcome> {
  const db = getDb()
  const tables = getTables()

  let sinceDate: Date | null = null
  if (since) {
    const parsed = new Date(since)
    if (!Number.isNaN(parsed.getTime())) {
      if (Date.now() - parsed.getTime() > SEVEN_DAYS_MS) {
        return { changes: [], cursor: new Date().toISOString(), expired: true, resolvedConflicts: [] }
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

  const changes = rows.map((r) => ({
    entityType: 'frame_document',
    entityId: r.identifier,
    operation: 'upsert' as const,
    payload: r.data,
    revision: r.revision ?? 1,
    updatedAt: new Date(r.updatedAt).toISOString(),
  }))

  const latest = changes.reduce((acc: number, c) => Math.max(acc, new Date(c.updatedAt).getTime()), 0)
  const cursor = latest ? new Date(latest).toISOString() : new Date().toISOString()

  let resolvedConflicts: PullOutcome['resolvedConflicts'] = []
  try {
    const resolved = await db.select().from(tables.syncConflicts).where(eq(tables.syncConflicts.instanceId, authedInstanceId))
    resolvedConflicts = resolved
      .filter((c) => c.status === 'local' || c.status === 'remote' || c.status === 'discarded')
      .map((c) => ({ entityId: c.entityId, resolution: c.status }))
  } catch (e: unknown) {
    console.error('resolved conflict scan failed:', e)
  }

  return { changes, cursor, resolvedConflicts }
}
