import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import {
  CANVAS_ASSET_PREFIX,
  canvasAssetMime,
  hashCanvasAsset,
  putCanvasAsset,
} from '@/lib/canvas/assets'
import { requireHostedOperator } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  if (process.env.INSTANCE_ID) {
    return NextResponse.json({ error: 'console only' }, { status: 403 })
  }
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is too large' }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = canvasAssetMime(bytes)
  if (!mime) return NextResponse.json({ error: 'Use a JPEG, PNG, GIF or WebP image' }, { status: 415 })

  const hash = hashCanvasAsset(bytes)
  const record = await putCanvasAsset({ hash, mime, bytes })
  await audit(
    operator?.ok ? operator.actor : 'operator',
    'canvas_asset.upload',
    'canvas_asset',
    hash,
    { mime: record.mime, size: record.size },
  )

  return NextResponse.json({
    ref: `${CANVAS_ASSET_PREFIX}${record.hash}`,
    hash: record.hash,
    mime: record.mime,
    size: record.size,
  })
}
