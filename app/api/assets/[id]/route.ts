import { NextRequest, NextResponse } from 'next/server'
import { getAsset } from '@/lib/assets/registry'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { safeAssetPath, deliveryType } from '@/lib/assets/storage'
import { resolveActor } from '@/lib/http-auth'
import fs from 'node:fs'
import { eq } from 'drizzle-orm'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`

// Delivery stays credential-free (frames reference assets in <img>/<video>),
// but the type is sanitized: whatever was ever stored, only allowlisted media
// types render inline; SVG is downgraded to text; everything else downloads.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'missing file' }, { status: 404 })
  const buf = fs.readFileSync(filePath)
  const { contentType, inline } = deliveryType(asset.mime)
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': inline ? 'inline' : `attachment; filename="${encodeURIComponent(asset.name)}"`,
  }
  return new NextResponse(buf, { headers })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(req)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (asset.refCount > 0) return NextResponse.json({ error: 'asset in use' }, { status: 409 })
  // scan frame documents for references
  const db = getDb()
  const { frameDocuments: fd } = getTables()
  const docs = await db.select().from(fd)
  const referenced = docs.some((d) => {
    const json = JSON.stringify(d.data ?? '')
    return json.includes(asset.id) || json.includes(asset.name)
  })
  if (referenced) return NextResponse.json({ error: 'asset in use' }, { status: 409 })
  const { assets } = getTables()
  await db.delete(assets).where(eq(assets.id, id))
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  try {
    fs.unlinkSync(filePath)
  } catch (e: unknown) {
    console.error('asset file delete failed:', e)
  }
  return NextResponse.json({ ok: true })
}
