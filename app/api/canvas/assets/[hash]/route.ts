import { NextResponse } from 'next/server'
import { canvasAssetMime, getCanvasAsset } from '@/lib/canvas/assets'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'invalid hash' }, { status: 400 })
  }
  const bytes = getCanvasAsset(hash)
  if (!bytes) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const mime = canvasAssetMime(bytes)
  if (!mime) return NextResponse.json({ error: 'unsupported media type' }, { status: 415 })
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
