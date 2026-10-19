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

export function createSnapshot(dataDir?: string): string {
  const dd = dataDir || process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
  const dir = backupDir(dd)
  fs.mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const src = path.join(dd, 'frame.db')
  const dst = path.join(dir, `frame-${ts}.db`)
  // checkpoint WAL first if possible
  try {
    const Database = require('better-sqlite3')
    const db = new Database(src)
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {}
  fs.copyFileSync(src, dst)
  for (const ext of ['-wal', '-shm']) {
    const s2 = src + ext
    if (fs.existsSync(s2)) fs.copyFileSync(s2, dst + ext)
  }
  return dst
}
