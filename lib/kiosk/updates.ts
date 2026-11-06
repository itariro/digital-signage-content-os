import { compareVersions } from '../semver'
export { compareVersions }

export interface VersionInfo {
  current: string
  latest: string
  channel: string
}

export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0
}

export interface ReleaseInfo { tag: string; version: string; assetUrl: string | null; assetName: string | null }

export function parseLatestRelease(json: any): ReleaseInfo {
  const tag = String(json?.tag_name ?? '')
  const version = tag.replace(/^v/, '')
  const assets = Array.isArray(json?.assets) ? json.assets : []
  const asset = assets.find((a: any) => typeof a?.name === 'string' && /^dscos-.*\.tar\.gz$/.test(a.name)) || null
  return { tag, version, assetUrl: asset?.browser_download_url ?? null, assetName: asset?.name ?? null }
}

export function isUpdateAvailableFor(currentApp: string, currentInstaller: string, latest: string): boolean {
  return compareVersions(latest, currentApp) > 0 || compareVersions(latest, currentInstaller) > 0
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
