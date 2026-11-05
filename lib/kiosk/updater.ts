import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
  return path.join(updateRoot(), 'lock')
}
export function installerVersionFile(): string {
  return process.env.KIOSK_INSTALLER_VERSION_FILE || '/etc/kiosk/installer.version'
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

interface LockOwner {
  token: string
  pid: number
  startedAt: number
  bootId: string | null
  startTime: string | null
}

function readBootId(): string | null {
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null
  } catch {
    return null
  }
}

function readProcessStartTime(pid: number): string | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const end = stat.lastIndexOf(')')
    if (end < 0) return null
    // Field 3 is the state, field 22 is the process start time.
    const fields = stat.slice(end + 2).trim().split(/\s+/)
    return fields[19] ?? null
  } catch {
    return null
  }
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e: unknown) {
    // EPERM means the process exists but belongs to another user.
    return (e as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

function readLockOwner(lockPath: string, f: typeof fs): LockOwner | null {
  try {
    const raw = f.readFileSync(lockPath, 'utf8')
    const owner = JSON.parse(raw)
    if (!owner || typeof owner.token !== 'string') return null
    return owner as LockOwner
  } catch {
    return null
  }
}

function inspectLock(lockPath: string, f: typeof fs): { stale: boolean; owner: LockOwner | null } {
  const owner = readLockOwner(lockPath, f)
  // A missing or malformed owner cannot identify a live process.
  if (!owner) return { stale: true, owner: null }
  const bootId = readBootId()
  if (bootId && owner.bootId && bootId !== owner.bootId) return { stale: true, owner }
  if (!processAlive(owner.pid)) return { stale: true, owner }
  const startTime = readProcessStartTime(owner.pid)
  // Catch PID reuse: the same pid now belongs to a different process.
  if (startTime && owner.startTime && startTime !== owner.startTime) return { stale: true, owner }
  return { stale: false, owner }
}

export interface LockOptions {
  timeoutMs?: number
  pollMs?: number
  fsImpl?: typeof fs
  pid?: number
  now?: () => number
}

// The lock file carries the owner PID, boot id and process start time. A
// crashed or powered-off update leaves a stale record that the next run
// detects and removes. Normal exits release it in a finally block.
export async function acquireUpdateLock(lockPath: string, opts: LockOptions = {}): Promise<UpdateLock | null> {
  const f = opts.fsImpl ?? fs
  const timeoutMs = opts.timeoutMs ?? 30_000
  const pollMs = opts.pollMs ?? 250
  const now = opts.now ?? Date.now
  const pid = opts.pid ?? process.pid
  const deadline = now() + timeoutMs
  f.mkdirSync(path.dirname(lockPath), { recursive: true })

  for (;;) {
    const owner: LockOwner = {
      token: crypto.randomUUID(),
      pid,
      startedAt: now(),
      bootId: readBootId(),
      startTime: readProcessStartTime(pid),
    }
    // Write the owner to a private file first, then hard-link it into place.
    // link(2) is atomic, so another process never sees a half-written lock.
    const tmp = `${lockPath}.${pid}.${owner.token}.tmp`
    try {
      f.writeFileSync(tmp, JSON.stringify(owner), { mode: 0o600, flag: 'wx' })
      f.linkSync(tmp, lockPath)
      return {
        path: lockPath,
        release: () => releaseUpdateLock(lockPath, owner.token, f),
      }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e
    } finally {
      try { f.rmSync(tmp, { force: true }) } catch {}
    }
    const inspection = inspectLock(lockPath, f)
    if (inspection.stale) {
      // Only remove the record we inspected. If another run replaced it in
      // the meantime, leave the new lock alone and retry.
      const current = readLockOwner(lockPath, f)
      const sameOwner = inspection.owner
        ? current?.token === inspection.owner.token
        : current === null
      if (sameOwner) {
        try { f.rmSync(lockPath, { force: true }) } catch {}
      }
      continue
    }
    if (now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

function releaseUpdateLock(lockPath: string, token: string, f: typeof fs): void {
  const owner = readLockOwner(lockPath, f)
  // Never remove a lock that another run acquired after ours disappeared.
  if (owner && owner.token !== token) return
  try {
    f.rmSync(lockPath, { force: true })
  } catch {
    /* best effort */
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
