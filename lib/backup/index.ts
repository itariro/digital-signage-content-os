import fs from 'node:fs'
import path from 'node:path'

export interface BackupFile { name: string; mtime: number; path: string }

export function rotateBackups(files: BackupFile[], maxN: number): BackupFile[] {
  const sorted = [...files].sort((a, b) => a.mtime - b.mtime)
  return sorted.slice(Math.max(0, sorted.length - maxN))
}

export function backupDir(dataDir = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`) {
  return path.join(dataDir, 'backups')
}

export function dbFilePath() {
  return process.env.FRAME_DB_PATH || path.join(process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`, 'frame.db')
}

function siblingsOf(p: string): string[] {
  return [p + '-wal', p + '-shm'].filter((s) => fs.existsSync(s))
}

/**
 * Copy the live db (checkpointed) into the backups dir and enforce
 * BACKUP_MAX rotation. Returns the snapshot path or null when there is
 * nothing to protect (fresh/empty database).
 */
export function snapshotIfPopulated(dataDir?: string, dbPath = dbFilePath()): string | null {
  const dd = dataDir || process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return null
  let populated = false
  try {
    const Database = require('better-sqlite3')
    const probe = new Database(dbPath, { readonly: true })
    const row = probe.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name != '_migrations'").get() as { c: number } | undefined
    populated = (row?.c ?? 0) > 0
    probe.close()
  } catch {
    return null
  }
  if (!populated) return null
  const dst = createSnapshot(dd, dbPath)
  pruneBackups(backupDir(dd))
  return dst
}

export function pruneBackups(dir = backupDir(), maxN = Number(process.env.BACKUP_MAX ?? 10)) {
  if (!fs.existsSync(dir)) return
  const dbs = fs.readdirSync(dir)
    .filter((f) => /^frame-.*\.db$/.test(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs, path: path.join(dir, f) }))
  const keep = new Set(rotateBackups(dbs, maxN).map((f) => f.path))
  for (const f of dbs) {
    if (keep.has(f.path)) continue
    for (const s of [f.path, ...siblingsOf(f.path)]) {
      try { fs.unlinkSync(s) } catch (e: unknown) { console.error('backup prune failed:', s, e) }
    }
  }
}

/**
 * Restore the newest snapshot over the live db file (used when the integrity
 * check fails at startup, spec §6). Copies the -wal sibling when present and
 * drops stale -wal/-shm of the broken file.
 */
export function restoreLatestBackup(dir = backupDir(), dst = dbFilePath()): boolean {
  if (!fs.existsSync(dir)) return false
  const dbs = fs.readdirSync(dir)
    .filter((f) => /^frame-.*\.db$/.test(f) && !/-wal$|-shm$/.test(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs, path: path.join(dir, f) }))
  const newest = dbs.sort((a, b) => b.mtime - a.mtime)[0]
  if (!newest) return false
  for (const s of siblingsOf(dst)) { try { fs.unlinkSync(s) } catch {} }
  fs.copyFileSync(newest.path, dst)
  if (fs.existsSync(newest.path + '-wal')) fs.copyFileSync(newest.path + '-wal', dst + '-wal')
  return true
}

export function createSnapshot(dataDir?: string, src = dbFilePath()): string {
  const dd = dataDir || process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
  const dir = backupDir(dd)
  fs.mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = path.join(dir, `frame-${ts}.db`)
  // checkpoint WAL first if possible
  try {
    const Database = require('better-sqlite3')
    const db = new Database(src)
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {}
  fs.copyFileSync(src, dst)
  for (const s of siblingsOf(src)) fs.copyFileSync(s, dst + s.slice(src.length))
  return dst
}
