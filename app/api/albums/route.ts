import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { albumCreateSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { defaultSlideshow } from '@/lib/albums'
import { frameIdParam } from '@/lib/frames/request'

export async function POST(request: Request) {
  const frameId = frameIdParam(request.url)
  const parsed = albumCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid album' }, { status: 400 })
  }
  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.albums.length >= 40) throw new Error('Album limit reached')
    s.albums.push({
      id,
      ...parsed.data,
      items: [],
      slideshow: defaultSlideshow(parsed.data.theme),
      createdAt: now,
      updatedAt: now,
    })
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return NextResponse.json({ error: store.message }, { status: 400 })
  return NextResponse.json({ store, id })
}
