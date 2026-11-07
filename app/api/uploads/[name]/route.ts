import fs from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { deriveMime, deliveryType } from '@/lib/assets/storage'

function dataDir() {
  return process.env.FRAME_DATA_DIR || path.join(process.cwd(), '.data')
}

// Serve image fills uploaded via POST /api/uploads from FRAME_DATA_DIR, so
// the URLs survive kiosk updates that replace the app directory (public/
// is wiped on update). Delivery is credential-free like /api/assets/[id]
// (frames reference fills in CSS backgrounds), but the content type is
// derived from magic bytes, never from the filename or client input, and
// the name is locked to a flat basename to block path traversal.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  if (!name || name.includes('\0') || path.basename(name) !== name || !/^[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(name)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const filePath = path.join(dataDir(), 'uploads', name)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const buf = fs.readFileSync(filePath)
  const derived = deriveMime(buf)
  if (!derived) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const { contentType, inline } = deliveryType(derived.mime)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': inline ? 'inline' : `attachment; filename="${encodeURIComponent(name)}"`,
    },
  })
}
