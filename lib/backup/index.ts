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
  fs.copyFileSync(src, dst)
  return dst
}
