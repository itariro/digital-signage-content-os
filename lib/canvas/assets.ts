import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { deliveryType, deriveMime } from '@/lib/assets/storage'
import { parseCanvasAssetRef } from './asset-refs'

export { CANVAS_ASSET_PREFIX, canvasAssetUrl, parseCanvasAssetRef } from './asset-refs'

export type CanvasAssetRecord = {
  hash: string
  mime: string
  size: number
}

export function hashCanvasAsset(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function dataDir(): string {
  return process.env.FRAME_DATA_DIR || path.join(process.cwd(), '.data')
}

function assetPath(hash: string, mime: string): string {
  const ext = mime.startsWith('image/jpeg') ? 'jpg' : mime.startsWith('image/') ? mime.slice(6) : 'bin'
  return path.join(dataDir(), 'canvas-assets', `${hash}.${ext}`)
}

/** Allowed inline image types only; the mime comes from magic bytes. */
export function canvasAssetMime(bytes: Buffer): string | null {
  const derived = deriveMime(bytes)
  if (!derived || !derived.mime.startsWith('image/')) return null
  if (derived.mime === 'image/svg+xml') return null
  return derived.mime
}

export function deliveryMime(mime: string): string {
  return deliveryType(mime).contentType
}

export async function putCanvasAsset(input: { hash: string; mime: string; bytes: Buffer }): Promise<CanvasAssetRecord> {
  if (!/^[a-f0-9]{64}$/.test(input.hash)) throw new Error('invalid canvas asset hash')
  if (hashCanvasAsset(input.bytes) !== input.hash) throw new Error('canvas asset hash mismatch')
  const db = getDb()
  const { canvasAssets } = getTables()
  const record: CanvasAssetRecord = { hash: input.hash, mime: input.mime, size: input.bytes.length }
  const target = assetPath(input.hash, input.mime)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, input.bytes)
  await db.insert(canvasAssets).values({
    hash: record.hash,
    mime: record.mime,
    size: record.size,
    createdAt: new Date(),
  }).onConflictDoNothing({ target: canvasAssets.hash })
  return record
}

export function getCanvasAsset(hash: string): Buffer | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null
  const dir = path.join(dataDir(), 'canvas-assets')
  if (!fs.existsSync(dir)) return null
  const found = fs.readdirSync(dir).find((name) => name.startsWith(`${hash}.`))
  if (!found) return null
  return fs.readFileSync(path.join(dir, found))
}

export async function listCanvasAssets(): Promise<CanvasAssetRecord[]> {
  const db = getDb()
  const { canvasAssets } = getTables()
  const rows = await db.select().from(canvasAssets)
  return rows.map((row) => ({
    hash: row.hash,
    mime: row.mime,
    size: row.size,
  }))
}

export function collectCanvasAssetRefs(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const hash = parseCanvasAssetRef(value)
    if (hash) into.add(hash)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCanvasAssetRefs(item, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectCanvasAssetRefs(item, into)
  }
  return into
}
