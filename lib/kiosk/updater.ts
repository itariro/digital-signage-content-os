import fs from 'node:fs'
import path from 'node:path'
import { parseLatestRelease, ReleaseInfo } from './updates'

// Root-owned parent that the kiosk user cannot replace.
export const UPDATE_ROOT = '/var/lib/dscos-updates'
export const STAGING_ROOT = '/var/lib/dscos-updates/staging'
export const BACKUP_ROOT = '/var/lib/dscos-updates/backup'
export const STATE_FILE = '/var/lib/dscos-updates/state.json'

export function stagingDir(version: string): string {
  return path.join(STAGING_ROOT, version)
}
export function backupDir(version: string): string {
  return path.join(BACKUP_ROOT, version)
}

export function validateStaging(dir: string, expectedVersion?: string): boolean {
  try {
    if (!fs.existsSync(path.join(dir, 'package.json'))) return false
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (!pkg?.version) return false
    if (expectedVersion && pkg.version !== expectedVersion) return false
    if (!fs.existsSync(path.join(dir, '.next'))) return false
    if (!fs.existsSync(path.join(dir, 'node_modules'))) return false
    return true
  } catch {
    return false
  }
}

export async function fetchLatestRelease(fetchFn: typeof fetch, version?: string): Promise<ReleaseInfo> {
  const url = version
    ? `https://api.github.com/repos/itariro/digital-signage-content-os/releases/tags/v${version}`
    : 'https://api.github.com/repos/itariro/digital-signage-content-os/releases/latest'
  const res = await fetchFn(url, {
    headers: { 'User-Agent': 'dscos-kiosk', Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`github releases: HTTP ${res.status}`)
  const json = await res.json()
  return parseLatestRelease(json)
}

export interface SwitchOpts {
  appDir: string
  staging: string
  backup: string
  fsImpl?: typeof fs
}
export function switchRelease(opts: SwitchOpts): { ok: boolean; error?: string } {
  const f = opts.fsImpl ?? fs
  try {
    if (!validateStaging(opts.staging)) return { ok: false, error: 'staging invalid' }
    // ensure backup parent exists
    f.mkdirSync(path.dirname(opts.backup), { recursive: true })
    const hadApp = f.existsSync(opts.appDir)
    if (hadApp) f.renameSync(opts.appDir, opts.backup)
    try {
      f.renameSync(opts.staging, opts.appDir)
    } catch (e) {
      // undo first move
      if (hadApp) f.renameSync(opts.backup, opts.appDir)
      throw e
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface RollbackOpts {
  appDir: string
  backup: string
  fsImpl?: typeof fs
}
export function rollbackRelease(opts: RollbackOpts): { ok: boolean; error?: string } {
  const f = opts.fsImpl ?? fs
  try {
    if (!f.existsSync(opts.backup)) return { ok: false, error: 'no backup available' }
    // preserve current tree until replacement succeeds
    const tmp = opts.appDir + '.rollback-tmp'
    if (f.existsSync(opts.appDir)) f.renameSync(opts.appDir, tmp)
    try {
      f.renameSync(opts.backup, opts.appDir)
    } catch (e) {
      if (f.existsSync(tmp)) f.renameSync(tmp, opts.appDir)
      throw e
    }
    if (f.existsSync(tmp)) f.rmSync(tmp, { recursive: true, force: true })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
