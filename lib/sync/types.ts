import type { CanvasState } from '@/lib/types'

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
  baseRevision?: number
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

export interface PullReport {
  appliedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

export interface PullCanvas {
  revision: number
  state: CanvasState | null
}

export interface PullResponse {
  changes: PullChange[]
  cursor: string
  reset?: boolean
  resolvedConflicts?: Array<{ entityId: string; resolution: string }>
  serverTime?: number
  canvas?: PullCanvas
}

export interface SyncStatus {
  queueDepth: number
  lastSyncAt: string | null
  lastError: string | null
  running: boolean
}
