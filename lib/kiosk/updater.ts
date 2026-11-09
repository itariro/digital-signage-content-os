import fs from 'node:fs'
import path from 'node:path'
import { parseLatestRelease, ReleaseInfo } from './updates'

// Root-owned parent that the kiosk user cannot replace.
export const UPDATE_ROOT = '/var/lib/dscos-updates'
export const STATE_FILE = '/var/lib/dscos-updates/state.json'

// Tests override these from a temp directory. Production frames use the
// root-owned defaults above.
export function updateRoot(): string {
  return process.env.KIOSK_UPDATE_ROOT || UPDATE_ROOT
}
export function stagingRoot(): string {
  return path.join(updateRoot(), 'staging')
}
export function backupRoot(): string {
  return path.join(updateRoot(), 'backup')
}
export function stateFile(): string {
  return process.env.KIOSK_UPDATE_STATE || path.join(updateRoot(), 'state.json')
}
export function lockFile(): string {
  return path.join(updateRoot(), 'lock.db')
}
export function installerVersionFile(): string {
  return process.env.KIOSK_INSTALLER_VERSION_FILE || '/etc/kiosk/installer.version'
}

// Files written by `install-kiosk.sh --update-runtime`. The release installer
// also prints its own list with `--runtime-files`; taking the union protects
// helpers that an older or newer release adds or removes.
export const RUNTIME_FILES = [
  '/usr/local/bin/kiosk',
  '/usr/local/lib/kiosk/session.sh',
  '/usr/local/bin/kiosk-ctl',
  '/usr/share/xsessions/kiosk.desktop',
  '/etc/systemd/system/dscos.service',
  '/etc/systemd/system/kiosk-update.service',
  '/etc/systemd/system/kiosk-update.timer',
  '/usr/local/bin/kiosk-standby-on',
  '/usr/local/bin/kiosk-standby-off',
  '/etc/systemd/system/kiosk-standby-on.service',
  '/etc/systemd/system/kiosk-standby-on.timer',
  '/etc/systemd/system/kiosk-standby-off.service',
  '/etc/systemd/system/kiosk-standby-off.timer',
]

export const RUNTIME_INCOMPLETE_MARKER = 'incomplete'

// systemd timers the installer manages. Their enabled/active state lives in
// systemd, not in the unit files, so a file-only snapshot cannot restore it:
// an update that enables a previously absent timer would leave a dangling
// enablement symlink after rollback. Record the state beside the files and
// replay it when the runtime is restored.
export const MANAGED_TIMERS = [
  'kiosk-update.timer',
  'kiosk-standby-on.timer',
  'kiosk-standby-off.timer',
]

export interface TimerStateEntry {
  unit: string
  enabled: string
  active: string
}

export function timerStatePath(dest: string): string {
  return path.join(dest, 'timers.json')
}

export function readTimerState(dest: string): TimerStateEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(timerStatePath(dest), 'utf8'))
    const entries = Array.isArray(parsed?.timers) ? parsed.timers : []
    return entries.filter((e: any): e is TimerStateEntry =>
      typeof e?.unit === 'string' &&
      MANAGED_TIMERS.includes(e.unit) &&
      typeof e?.enabled === 'string' &&
      typeof e?.active === 'string')
  } catch {
    return []
  }
}

export function writeTimerState(dest: string, entries: TimerStateEntry[]): RuntimeFileResult {
  try {
    fs.writeFileSync(timerStatePath(dest), JSON.stringify({ timers: entries }, null, 2), { mode: 0o600 })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function runtimeFiles(): string[] {
  const root = process.env.KIOSK_RUNTIME_ROOT || ''
  return RUNTIME_FILES.map((file) => (root ? path.join(root, file) : file))
}

export function runtimeBackupDir(version: string): string {
  return path.join(updateRoot(), 'runtime-backup', version)
}

export function stagingDir(version: string): string {
  return path.join(stagingRoot(), version)
}
export function backupDir(version: string): string {
  return path.join(backupRoot(), version)
}

export function validateStaging(dir: string, expectedVersion?: string): boolean {
  try {
    if (!fs.existsSync(path.join(dir, 'package.json'))) return false
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (!pkg?.version) return false
    if (expectedVersion && pkg.version !== expectedVersion) return false
    if (!fs.existsSync(path.join(dir, '.next'))) return false
    if (!fs.existsSync(path.join(dir, 'node_modules'))) return false
    // The installed CLI wrapper runs this file. A release without it would
    // remove `kiosk` from the frame after the switch.
    if (!fs.existsSync(path.join(dir, 'lib/kiosk/cli.ts'))) return false
    // Runtime helpers and unit files come from the installer in the release.
    if (!fs.existsSync(path.join(dir, 'install-kiosk.sh'))) return false
    return true
  } catch {
    return false
  }
}

export function readAppVersion(appDir: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
    return typeof pkg?.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function readInstallerVersion(): string {
  try {
    return fs.readFileSync(installerVersionFile(), 'utf8').trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function parseInstallerVersion(scriptPath: string): string | null {
  try {
    const text = fs.readFileSync(scriptPath, 'utf8')
    const m = text.match(/^\s*(?:readonly\s+)?INSTALLER_VERSION=(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m)
    return m?.[1] ?? m?.[2] ?? m?.[3] ?? null
  } catch {
    return null
  }
}

export interface RuntimeFileResult {
  ok: boolean
  error?: string
}

interface RuntimeManifestEntry {
  path: string
  present: boolean
  mode?: number
  blob?: string
}

// Copy the installed runtime files into `dest` before an update replaces
// them. Missing files are recorded too, so a rollback removes helpers that
// the old release did not have.
export function backupRuntimeFiles(files: string[], dest: string): RuntimeFileResult {
  try {
    fs.rmSync(dest, { recursive: true, force: true })
    fs.mkdirSync(path.join(dest, 'files'), { recursive: true })
    const manifest: RuntimeManifestEntry[] = []
    files.forEach((file, index) => {
      if (!path.isAbsolute(file)) throw new Error(`runtime file path is not absolute: ${file}`)
      try {
        const stat = fs.statSync(file)
        if (!stat.isFile()) {
          manifest.push({ path: file, present: false })
          return
        }
        const blob = `f${index}`
        fs.copyFileSync(file, path.join(dest, 'files', blob))
        fs.chmodSync(path.join(dest, 'files', blob), stat.mode & 0o7777)
        manifest.push({ path: file, present: true, mode: stat.mode & 0o7777, blob })
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
          manifest.push({ path: file, present: false })
          return
        }
        throw e
      }
    })
    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify({ files: manifest }, null, 2), { mode: 0o600 })
    // A snapshot with this marker may belong to a half-finished runtime
    // refresh. Completed snapshots drop it and are safe rollback targets only.
    fs.writeFileSync(path.join(dest, RUNTIME_INCOMPLETE_MARKER), '', { mode: 0o600 })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function isRuntimeBackupIncomplete(dest: string): boolean {
  return fs.existsSync(path.join(dest, RUNTIME_INCOMPLETE_MARKER))
}

export function markRuntimeBackupComplete(dest: string): RuntimeFileResult {
  try {
    fs.rmSync(path.join(dest, RUNTIME_INCOMPLETE_MARKER), { force: true })
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function restoreRuntimeFiles(dest: string): RuntimeFileResult {
  const errors: string[] = []
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'))
    const files: RuntimeManifestEntry[] = Array.isArray(manifest?.files) ? manifest.files : []
    for (const entry of files) {
      try {
        if (typeof entry?.path !== 'string' || !path.isAbsolute(entry.path)) {
          throw new Error('invalid manifest path')
        }
        if (!entry.present) {
          fs.rmSync(entry.path, { force: true })
          continue
        }
        if (typeof entry.blob !== 'string' || !/^f\d+$/.test(entry.blob)) {
          throw new Error('invalid manifest blob')
        }
        fs.mkdirSync(path.dirname(entry.path), { recursive: true })
        const tmp = `${entry.path}.dscos-restore-${process.pid}`
        try {
          fs.copyFileSync(path.join(dest, 'files', entry.blob), tmp)
          fs.chmodSync(tmp, typeof entry.mode === 'number' ? entry.mode : 0o644)
          fs.renameSync(tmp, entry.path)
        } catch (e: unknown) {
          try { fs.rmSync(tmp, { force: true }) } catch {}
          throw e
        }
      } catch (e: unknown) {
        errors.push(`${entry?.path ?? 'unknown'}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return errors.length ? { ok: false, error: errors.join('; ') } : { ok: true }
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

export interface UpdateLock {
  path: string
  release: () => void
}

export interface LockOptions {
  timeoutMs?: number
}

// SQLite holds an exclusive lock on this database for as long as the
// connection is open. The kernel releases it when the process exits, so a
// crash or power loss never leaves an update blocked. A second run waits on
// `busy_timeout` instead of polling a lock file.
export async function acquireUpdateLock(lockPath: string, opts: LockOptions = {}): Promise<UpdateLock | null> {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  // better-sqlite3 is a native module and only the update lock needs it.
  // Requiring it here keeps every other CLI command (status, config,
  // version, ...) free of the native load and of the hard dependency.
  const Database = require('better-sqlite3')
  const db = new Database(lockPath)
  try {
    db.pragma(`busy_timeout = ${opts.timeoutMs ?? 30_000}`)
    db.exec('BEGIN EXCLUSIVE')
  } catch (e: unknown) {
    try { db.close() } catch {}
    if ((e as NodeJS.ErrnoException)?.code === 'SQLITE_BUSY') return null
    throw e
  }
  let released = false
  return {
    path: lockPath,
    release: () => {
      if (released) return
      released = true
      try { db.exec('COMMIT') } catch {}
      try { db.close() } catch {}
    },
  }
}

export interface SwitchOpts {
  appDir: string
  staging: string
  backup: string
  expectedVersion?: string
  fsImpl?: typeof fs
}
export function switchRelease(opts: SwitchOpts): { ok: boolean; error?: string } {
  const f = opts.fsImpl ?? fs
  try {
    if (!validateStaging(opts.staging, opts.expectedVersion)) return { ok: false, error: 'staging invalid' }
    // ensure backup parent exists
    f.mkdirSync(path.dirname(opts.backup), { recursive: true })
    const hadApp = f.existsSync(opts.appDir)
    if (hadApp) f.renameSync(opts.appDir, opts.backup)
    try {
      f.renameSync(opts.staging, opts.appDir)
    } catch (e) {
      // undo first move
      if (hadApp && f.existsSync(opts.backup)) f.renameSync(opts.backup, opts.appDir)
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
    const tmp = `${opts.appDir}.rollback-tmp`
    if (f.existsSync(opts.appDir)) f.renameSync(opts.appDir, tmp)
    try {
      f.renameSync(opts.backup, opts.appDir)
    } catch (e) {
      if (f.existsSync(tmp)) f.renameSync(tmp, opts.appDir)
      throw e
    }
    try { f.rmSync(tmp, { recursive: true, force: true }) } catch { /* leftover tmp is harmless */ }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
