import { NextResponse } from 'next/server'
import { albumUpdateSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = albumUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid album' }, { status: 400 })
  }
  let found = false
  const store = await mutateStore((s) => {
    const album = s.albums.find((a) => a.id === id)
    if (!album) return
    found = true
    Object.assign(album, parsed.data, { updatedAt: new Date().toISOString() })
  })
  if (!found) return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  return NextResponse.json({ store, id })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = await mutateStore((s) => {
    s.albums = s.albums.filter((a) => a.id !== id)
    for (const layout of s.layouts) {
      if (layout.settings.albumId === id) layout.settings.albumId = null
    }
  })
  return NextResponse.json({ store })
}
