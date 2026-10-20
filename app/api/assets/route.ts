import { NextRequest, NextResponse } from 'next/server'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { registerAsset } from '@/lib/assets/registry'
import { safeAssetPath, hashBuffer } from '@/lib/assets/storage'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
const ALLOWED = ['upload.wikimedia.org','commons.wikimedia.org','images.unsplash.com']

export async function GET(req: NextRequest) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const type = req.nextUrl.searchParams.get('type')
  const rows = await db.select().from(assets)
  const filtered = type ? rows.filter((r: any) => r.type === type) : rows
  return NextResponse.json({ assets: filtered })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  let buf: Buffer
  let mime = 'application/octet-stream'
  let name = 'asset'
  if (typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
    const m = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'bad dataUrl' }, { status: 400 })
    mime = m[1]; buf = Buffer.from(m[2], 'base64')
    name = body.name || `upload.${mime.split('/')[1] || 'bin'}`
  } else if (typeof body.url === 'string') {
    let u: URL
    try { u = new URL(body.url) } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }) }
    if (!ALLOWED.includes(u.hostname)) return NextResponse.json({ error: 'host not allowed' }, { status: 400 })
    const r = await fetch(body.url)
    if (!r.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
    buf = Buffer.from(await r.arrayBuffer())
    mime = r.headers.get('content-type') || mime
    name = body.name || path.basename(u.pathname) || 'remote'
  } else {
    return NextResponse.json({ error: 'dataUrl or url required' }, { status: 400 })
  }
  if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const hash = hashBuffer(buf)
  const ext = (name.match(/\.(\w+)$/) || ['', 'bin'])[1]
  const assetName = `${hash.slice(0, 12)}.${ext}`
  const target = safeAssetPath(DATA_DIR, assetName)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, buf)
  const asset = await registerAsset({ type: body.type || 'image', name: assetName, mime, size: buf.length, hash, source: body.url ? 'remote' : 'local' })
  return NextResponse.json({ asset, url: `/api/assets/${asset.id}` })
}
