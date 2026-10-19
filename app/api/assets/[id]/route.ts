import { NextRequest, NextResponse } from 'next/server'
import { getAsset, adjustRefCount } from '@/lib/assets/registry'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { safeAssetPath } from '@/lib/assets/storage'
import fs from 'node:fs'
import { eq } from 'drizzle-orm'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'missing file' }, { status: 404 })
  const buf = fs.readFileSync(filePath)
  return new NextResponse(buf, { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'public, max-age=31536000, immutable' } })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (asset.refCount > 0) return NextResponse.json({ error: 'asset in use' }, { status: 409 })
  // scan frame documents for references
  const db2 = getDb() as any
  const { frameDocuments: fd } = getTables() as any
  const docs = await db2.select().from(fd)
  const referenced = (docs as any[]).some((d) => JSON.stringify(d.data ?? '').includes(asset.id) || JSON.stringify(d.data ?? '').includes(asset.name))
  if (referenced) return NextResponse.json({ error: 'asset in use' }, { status: 409 })
  const db = getDb() as any
  const { assets } = getTables() as any
  await db.delete(assets).where(eq(assets.id, id))
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  try { fs.unlinkSync(filePath) } catch {}
  return NextResponse.json({ ok: true })
}
