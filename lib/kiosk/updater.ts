import fs from 'node:fs'
import path from 'node:path'
import { parseLatestRelease, ReleaseInfo } from './updates'

export const STAGING_ROOT = '/var/lib/dscos/staging'
export const BACKUP_ROOT = '/var/lib/dscos/backup'
export const STATE_FILE = '/var/lib/dscos/update-state.json'

export function stagingDir(version: string): string {
  return path.join(STAGING_ROOT, version)
}
export function backupDir(version: string): string {
  return path.join(BACKUP_ROOT, version)
}

export function validateStaging(dir: string): boolean {
  try {
    if (!fs.existsSync(path.join(dir, 'package.json'))) return false
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (!pkg?.version) return false
    if (!fs.existsSync(path.join(dir, '.next'))) return false
    return true
  } catch {
    return false
  }
}

export async function fetchLatestRelease(fetchFn: typeof fetch): Promise<ReleaseInfo> {
  const res = await fetchFn('https://api.github.com/repos/itariro/digital-signage-content-os/releases/latest', {
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
    if (f.existsSync(opts.appDir)) f.renameSync(opts.appDir, opts.backup)
    f.renameSync(opts.staging, opts.appDir)
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
    if (f.existsSync(opts.appDir)) f.rmSync(opts.appDir, { recursive: true, force: true })
    f.renameSync(opts.backup, opts.appDir)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
