import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { registerAsset, getAsset } from './registry'
import { safeAssetPath, hashBuffer, deriveMime, deliveryType } from './storage'

const REMOTE_HOSTS = ['upload.wikimedia.org', 'commons.wikimedia.org', 'images.unsplash.com']
const MAX_FILE_BYTES = 10 * 1024 * 1024

export type AssetFailure = { ok: false; error: string; status: number }
export type Outcome<T> = { ok: true; value: T } | AssetFailure

function dataDir() {
  return process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
}

/**
 * Upload "how": decode/fetch bytes, size check, magic-byte media derivation,
 * quota enforcement, content-addressed storage write, registry dedup.
 * Authorization happens in the route; this service owns the mechanics.
 */
export async function ingestAsset(body: unknown): Promise<Outcome<{ asset: unknown; url: string }>> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid json', status: 400 }
  const record = body as Record<string, unknown>
  let buf: Buffer
  if (typeof record.dataUrl === 'string' && record.dataUrl.startsWith('data:')) {
    const m = record.dataUrl.match(/^data:[^;]+;base64,(.+)$/)
    if (!m) return { ok: false, error: 'bad dataUrl', status: 400 }
    buf = Buffer.from(m[1], 'base64')
  } else if (typeof record.url === 'string') {
    let u: URL
    try { u = new URL(record.url) } catch { return { ok: false, error: 'bad url', status: 400 } }
    if (!REMOTE_HOSTS.includes(u.hostname)) return { ok: false, error: 'host not allowed', status: 400 }
    const r = await fetch(record.url)
    if (!r.ok) return { ok: false, error: 'fetch failed', status: 502 }
    buf = Buffer.from(await r.arrayBuffer())
  } else {
    return { ok: false, error: 'dataUrl or url required', status: 400 }
  }

  if (buf.length > MAX_FILE_BYTES) return { ok: false, error: 'too large', status: 413 }

  // The client-declared mime is ignored entirely: the media type comes from
  // the bytes themselves, and anything outside image/video/font is refused.
  const derived = deriveMime(buf)
  if (!derived) return { ok: false, error: 'unsupported media type', status: 415 }

  const hash = hashBuffer(buf)
  const db = getDb()
  const { assets } = getTables()
  const existing = await db.select().from(assets).where(eq(assets.hash, hash))
  if (!existing.length) {
    const rows = await db.select({ id: assets.id, size: assets.size }).from(assets)
    const maxCount = Number(process.env.ASSET_MAX_COUNT ?? 5000)
    if (rows.length >= maxCount) return { ok: false, error: 'asset quota exceeded', status: 507 }
    const maxTotal = Number(process.env.ASSET_MAX_TOTAL_BYTES ?? 512 * 1024 * 1024)
    const total = rows.reduce((sum, r) => sum + (r.size ?? 0), 0)
    if (total + buf.length > maxTotal) return { ok: false, error: 'asset storage quota exceeded', status: 507 }
  }

  const assetName = `${hash.slice(0, 12)}.${derived.ext}`
  const target = safeAssetPath(dataDir(), assetName)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, buf)
  const asset = await registerAsset({
    type: typeof record.type === 'string' ? record.type : derived.mime.split('/')[0],
    name: assetName,
    mime: derived.mime,
    size: buf.length,
    hash,
    source: typeof record.url === 'string' ? 'remote' : 'local',
  })
  return { ok: true, value: { asset, url: `/api/assets/${asset.id}` } }
}

export async function listAssets(type?: string | null) {
  const db = getDb()
  const { assets } = getTables()
  const rows = await db.select().from(assets)
  return type ? rows.filter((r) => r.type === type) : rows
}

/** Delivery lookup: row + bytes + sanitized content type for the response. */
export async function deliverAsset(id: string): Promise<Outcome<{ buf: Buffer; contentType: string; inline: boolean; name: string }>> {
  const asset = await getAsset(id)
  if (!asset) return { ok: false, error: 'not found', status: 404 }
  const filePath = safeAssetPath(dataDir(), asset.name)
  if (!fs.existsSync(filePath)) return { ok: false, error: 'missing file', status: 404 }
  const { contentType, inline } = deliveryType(asset.mime)
  return { ok: true, value: { buf: fs.readFileSync(filePath), contentType, inline, name: asset.name } }
}

export async function removeAsset(id: string): Promise<Outcome<true>> {
  const asset = await getAsset(id)
  if (!asset) return { ok: false, error: 'not found', status: 404 }
  if (asset.refCount > 0) return { ok: false, error: 'asset in use', status: 409 }
  const db = getDb()
  const { frameDocuments: fd, assets } = getTables()
  const docs = await db.select({ data: fd.data }).from(fd)
  const referenced = docs.some((d) => {
    const json = JSON.stringify(d.data ?? '')
    return json.includes(asset.id) || json.includes(asset.name)
  })
  if (referenced) return { ok: false, error: 'asset in use', status: 409 }
  await db.delete(assets).where(eq(assets.id, id))
  const filePath = safeAssetPath(dataDir(), asset.name)
  try {
    fs.unlinkSync(filePath)
  } catch (e: unknown) {
    console.error('asset file delete failed:', e)
  }
  return { ok: true, value: true }
}
