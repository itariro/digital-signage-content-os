import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { deriveMime } from '@/lib/assets/storage'
import { requireHostedOperator } from '@/lib/http-auth'

const MAX_BYTES = 10 * 1024 * 1024

function dataDir() {
  return process.env.FRAME_DATA_DIR || path.join(process.cwd(), '.data')
}

// Uploads live under FRAME_DATA_DIR (not public/), so they survive kiosk
// updates that replace the app directory — same durability rule as
// lib/assets/storage.ts (FRAME_DATA_DIR/assets). They are served back by
// app/api/uploads/[name]/route.ts. .data/ is gitignored.
const UPLOAD_DIR = () => path.join(dataDir(), 'uploads')

// Image fills only: raster images whose type is derived from magic bytes.
// SVGs are excluded because they can carry script when served from public/.
const IMAGE_EXTS = new Set(['png', 'jpg', 'gif', 'webp'])

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 413 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const derived = deriveMime(bytes)
  if (!derived || !IMAGE_EXTS.has(derived.ext)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, WebP or GIF image' }, { status: 415 })
  }

  const name = `${nanoid(14)}.${derived.ext}`
  await fs.mkdir(UPLOAD_DIR(), { recursive: true })
  await fs.writeFile(path.join(UPLOAD_DIR(), name), bytes)

  return NextResponse.json({ url: `/api/uploads/${name}` })
}
