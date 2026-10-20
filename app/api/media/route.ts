import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { isAllowedArtworkHost } from '@/lib/albums'
import { MEDIA_DIR, MEDIA_TYPES } from '@/lib/media'
import { requireHostedOperator } from '@/lib/http-auth'

const MAX_BYTES = 10 * 1024 * 1024

const inputSchema = z.union([
  z.object({ url: z.string().url().max(600) }),
  z.object({ dataUrl: z.string().max(14_000_000).startsWith('data:image/') }),
])

async function save(name: string, bytes: Buffer) {
  await fs.mkdir(MEDIA_DIR, { recursive: true })
  await fs.writeFile(path.join(MEDIA_DIR, name), bytes)
  return NextResponse.json({ url: `/api/media/${name}` })
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid image' }, { status: 400 })

  if ('dataUrl' in parsed.data) {
    const match = parsed.data.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
    if (!match) return NextResponse.json({ error: 'Use a JPEG, PNG or WebP image' }, { status: 400 })
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: 'Image is too large' }, { status: 413 })
    return save(`${nanoid(14)}.${MEDIA_TYPES[match[1]]}`, bytes)
  }

  const url = new URL(parsed.data.url)
  if (url.protocol !== 'https:' || !isAllowedArtworkHost(url.hostname)) {
    return NextResponse.json({ error: 'That image source is not supported' }, { status: 400 })
  }
  const key = createHash('sha1').update(url.href).digest('hex').slice(0, 20)
  const existing = (await fs.readdir(MEDIA_DIR).catch(() => [])).find((f) => f.startsWith(`${key}.`))
  if (existing) return NextResponse.json({ url: `/api/media/${existing}` })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FrameStudio/1.0 (digital photo frame)' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    const type = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !MEDIA_TYPES[type]) throw new Error('Bad response')
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_BYTES || bytes.length < 200) throw new Error('Bad size')
    return save(`${key}.${MEDIA_TYPES[type]}`, bytes)
  } catch {
    return NextResponse.json({ error: 'Could not download that artwork' }, { status: 502 })
  }
}
