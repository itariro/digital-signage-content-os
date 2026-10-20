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

interface Signature {
  ext: string
  mime: string
  test: (b: Buffer) => boolean
}

const SIGNATURES: Signature[] = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('latin1') === 'GIF' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'mp4', mime: 'video/mp4', test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  { ext: 'webm', mime: 'video/webm', test: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { ext: 'woff', mime: 'font/woff', test: (b) => b.subarray(0, 4).toString('latin1') === 'wOFF' },
  { ext: 'woff2', mime: 'font/woff2', test: (b) => b.subarray(0, 4).toString('latin1') === 'wOF2' },
  { ext: 'ttf', mime: 'font/ttf', test: (b) => b.length >= 4 && b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00 },
]

/**
 * Derive the media type from magic bytes. The client-declared type is never
 * trusted (H4: stored XSS came from serving attacker-chosen Content-Type).
 * Returns null for anything outside the allowlist (spec §7: image/video/font).
 * SVG is recognized but delivered sanitized (see DELIVERY_SAFE_MAP).
 */
export function deriveMime(buf: Buffer): { mime: string; ext: string } | null {
  const head = buf.subarray(0, 4096).toString('utf8')
  if (head.includes('<svg') || head.includes('<SVG')) return { mime: 'image/svg+xml', ext: 'svg' }
  for (const s of SIGNATURES) {
    if (s.test(buf)) return { mime: s.mime, ext: s.ext }
  }
  return null
}

/**
 * Content types that may be rendered inline in a browser context. Anything
 * else (including legacy poisoned rows) is served as octet-stream download.
 * SVG renders as text/plain: unsanitized SVG can carry script.
 */
export function deliveryType(storedMime: string): { contentType: string; inline: boolean } {
  switch (storedMime) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/gif':
    case 'image/webp':
    case 'video/mp4':
    case 'video/webm':
    case 'font/woff':
    case 'font/woff2':
    case 'font/ttf':
      return { contentType: storedMime, inline: true }
    case 'image/svg+xml':
      return { contentType: 'text/plain', inline: true }
    default:
      return { contentType: 'application/octet-stream', inline: false }
  }
}
