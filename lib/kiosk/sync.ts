export type SyncAction = 'noop' | 'pull' | 'push' | 'conflict' | 'error'

export interface SyncState {
  lastSyncAt: string | null
  status: 'idle' | 'running' | 'success' | 'error'
  error: string | null
  retryCount: number
  pendingChanges: number
}

export interface SyncPlanInput {
  localUpdatedAt: string | null
  remoteUpdatedAt: string | null
  localHash: string | null
  remoteHash: string | null
  hasLocalChanges: boolean
  hasRemoteChanges: boolean
}

export interface SyncPlan {
  action: SyncAction
  reason: string
}

export function planSync(input: SyncPlanInput): SyncPlan {
  if (!input.localUpdatedAt && !input.remoteUpdatedAt) return { action: 'noop', reason: 'no data on either side' }
  if (!input.remoteUpdatedAt) return { action: 'push', reason: 'remote has no data' }
  if (!input.localUpdatedAt) return { action: 'pull', reason: 'local has no data' }
  if (input.localHash && input.remoteHash && input.localHash === input.remoteHash) {
    return { action: 'noop', reason: 'content identical' }
  }
  if (input.hasLocalChanges && input.hasRemoteChanges) {
    return { action: 'conflict', reason: 'both sides changed since last sync' }
  }
  if (input.hasRemoteChanges) return { action: 'pull', reason: 'remote changed' }
  if (input.hasLocalChanges) return { action: 'push', reason: 'local changed' }
  // fallback to timestamps
  const l = Date.parse(input.localUpdatedAt)
  const r = Date.parse(input.remoteUpdatedAt)
  if (Number.isNaN(l) || Number.isNaN(r)) return { action: 'error', reason: 'invalid timestamp' }
  if (r > l) return { action: 'pull', reason: 'remote newer' }
  if (l > r) return { action: 'push', reason: 'local newer' }
  return { action: 'noop', reason: 'timestamps equal' }
}

export function nextRetryDelay(attempt: number, baseMs = 1000, maxMs = 60000): number {
  if (attempt < 0) attempt = 0
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt))
  // jitter +/- 20%
  const jitter = exp * (0.8 + Math.random() * 0.4)
  return Math.round(Math.min(maxMs, jitter))
}

export function createInitialSyncState(): SyncState {
  return { lastSyncAt: null, status: 'idle', error: null, retryCount: 0, pendingChanges: 0 }
}

export function markSyncSuccess(state: SyncState, now: Date): SyncState {
  return { ...state, lastSyncAt: now.toISOString(), status: 'success', error: null, retryCount: 0 }
}

export function markSyncError(state: SyncState, error: string): SyncState {
  return { ...state, status: 'error', error, retryCount: state.retryCount + 1 }
}

export function redactEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    if (u.password) u.password = '***'
    if (u.username) u.username = '***'
    return u.toString()
  } catch {
    return endpoint.replace(/:\/\/[^@]+@/, '://***@')
  }
}
