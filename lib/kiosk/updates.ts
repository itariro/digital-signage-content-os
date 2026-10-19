export interface VersionInfo {
  current: string
  latest: string
  channel: string
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0
}

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'validating' | 'staging' | 'switching' | 'done' | 'failed' | 'rolled-back'

export interface UpdateState {
  phase: UpdatePhase
  fromVersion: string
  toVersion: string
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  lastKnownGood: string | null
}

export function createUpdateState(current: string): UpdateState {
  return { phase: 'idle', fromVersion: current, toVersion: current, error: null, startedAt: null, finishedAt: null, lastKnownGood: current }
}

export function beginUpdate(state: UpdateState, target: string, now: Date): UpdateState {
  return { ...state, phase: 'checking', toVersion: target, error: null, startedAt: now.toISOString(), lastKnownGood: state.fromVersion }
}

export function failUpdate(state: UpdateState, error: string, now: Date): UpdateState {
  return { ...state, phase: 'failed', error, finishedAt: now.toISOString() }
}

export function completeUpdate(state: UpdateState, now: Date): UpdateState {
  return { ...state, phase: 'done', fromVersion: state.toVersion, finishedAt: now.toISOString() }
}

export function rollbackUpdate(state: UpdateState, now: Date): UpdateState {
  const target = state.lastKnownGood ?? state.fromVersion
  return { ...state, phase: 'rolled-back', toVersion: target, fromVersion: target, finishedAt: now.toISOString() }
}

export function canRollback(state: UpdateState): boolean {
  return !!state.lastKnownGood && state.lastKnownGood !== state.fromVersion
}
