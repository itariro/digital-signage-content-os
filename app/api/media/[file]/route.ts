import { promises as fs } from 'node:fs'
import path from 'node:path'
import { EXT_TYPES, MEDIA_DIR } from '@/lib/media'

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const match = file.match(/^[\w-]{6,40}\.(jpg|png|webp|gif)$/)
  if (!match) return new Response('Not found', { status: 404 })
  try {
    const bytes = await fs.readFile(path.join(MEDIA_DIR, file))
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': EXT_TYPES[match[1]],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
