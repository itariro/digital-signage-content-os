export interface SyncChange {
  idempotencyKey: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  baseRevision?: number
}

export interface EnqueueInput {
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  idempotencyKey: string
}

export interface PushRequest {
  instanceId: string
  apiVersion: string
  changes: SyncChange[]
}

export interface PushConflict {
  idempotencyKey: string
  entityType: string
  entityId: string
  localRevision: number
  remoteRevision: number
}

export interface PushResponse {
  accepted: string[]
  conflicts: PushConflict[]
}

export interface PullChange {
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  revision: number
  updatedAt: string
}

export interface PullResponse {
  changes: PullChange[]
  cursor: string
  reset?: boolean
}

export interface SyncStatus {
  queueDepth: number
  lastSyncAt: string | null
  lastError: string | null
  running: boolean
}
