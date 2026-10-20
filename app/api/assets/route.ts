import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { registerAsset } from '@/lib/assets/registry'
import { safeAssetPath, hashBuffer, deriveMime } from '@/lib/assets/storage'
import { resolveActor } from '@/lib/http-auth'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
const REMOTE_HOSTS = ['upload.wikimedia.org', 'commons.wikimedia.org', 'images.unsplash.com']
const MAX_FILE_BYTES = 10 * 1024 * 1024

function denied(outcome: { ok: false; reason: string }) {
  return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
}

export async function GET(req: NextRequest) {
  const outcome = await resolveActor(req)
  if (!outcome.ok) return denied(outcome)
  const db = getDb() as any
  const { assets } = getTables() as any
  const type = req.nextUrl.searchParams.get('type')
  const rows = await db.select().from(assets)
  const filtered = type ? rows.filter((r: any) => r.type === type) : rows
  return NextResponse.json({ assets: filtered })
}

export async function POST(req: NextRequest) {
  const outcome = await resolveActor(req)
  if (!outcome.ok) return denied(outcome)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  let buf: Buffer
  if (typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
    const m = body.dataUrl.match(/^data:[^;]+;base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'bad dataUrl' }, { status: 400 })
    buf = Buffer.from(m[1], 'base64')
  } else if (typeof body.url === 'string') {
    let u: URL
    try { u = new URL(body.url) } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }) }
    if (!REMOTE_HOSTS.includes(u.hostname)) return NextResponse.json({ error: 'host not allowed' }, { status: 400 })
    const r = await fetch(body.url)
    if (!r.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
    buf = Buffer.from(await r.arrayBuffer())
  } else {
    return NextResponse.json({ error: 'dataUrl or url required' }, { status: 400 })
  }

  if (buf.length > MAX_FILE_BYTES) return NextResponse.json({ error: 'too large' }, { status: 413 })

  // The client-declared mime is ignored entirely: the media type comes from
  // the bytes themselves, and anything outside image/video/font is refused.
  const derived = deriveMime(buf)
  if (!derived) return NextResponse.json({ error: 'unsupported media type' }, { status: 415 })

  const hash = hashBuffer(buf)
  const db = getDb() as any
  const { assets } = getTables() as any
  const existing = await db.select().from(assets).where(eq(assets.hash, hash))
  const rows = await db.select({ id: assets.id, size: assets.size }).from(assets)
  if (!existing.length) {
    const maxCount = Number(process.env.ASSET_MAX_COUNT ?? 5000)
    if (rows.length >= maxCount) {
      return NextResponse.json({ error: 'asset quota exceeded' }, { status: 507 })
    }
    const maxTotal = Number(process.env.ASSET_MAX_TOTAL_BYTES ?? 512 * 1024 * 1024)
    const total = (rows as any[]).reduce((sum, r) => sum + (r.size ?? 0), 0)
    if (total + buf.length > maxTotal) {
      return NextResponse.json({ error: 'asset storage quota exceeded' }, { status: 507 })
    }
  }

  const assetName = `${hash.slice(0, 12)}.${derived.ext}`
  const target = safeAssetPath(DATA_DIR, assetName)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, buf)
  const asset = await registerAsset({
    type: body.type || derived.mime.split('/')[0],
    name: assetName,
    mime: derived.mime,
    size: buf.length,
    hash,
    source: typeof body.url === 'string' ? 'remote' : 'local',
  })
  return NextResponse.json({ asset, url: `/api/assets/${asset.id}` })
}
