import crypto from 'node:crypto'
import path from 'node:path'

export function safeAssetPath(dataDir: string, name: string): string {
  if (!name || name.includes('\0')) throw new Error('invalid name')
  const base = path.resolve(dataDir, 'assets')
  const target = path.resolve(base, name)
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('path traversal')
  if (path.basename(target) !== name) throw new Error('invalid name')
  return target
}

export function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}
