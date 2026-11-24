import { NextResponse } from 'next/server'
import { albumItemSchema, albumUpdateSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const body = await request.json().catch(() => null) as { item?: unknown } | null
  const parsed = albumItemSchema.safeParse(body?.item)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid album item' }, { status: 400 })
  }

  let found = false
  const store = await mutateStore((current) => {
    const album = current.albums.find((entry) => entry.id === id)
    if (!album) return
    found = true
    if (album.items.length >= 200) throw new Error('Album item limit reached')
    album.items.push(parsed.data)
    album.updatedAt = new Date().toISOString()
  }, frameId).catch((error: Error) => error)
  if (store instanceof Error) return NextResponse.json({ error: store.message }, { status: 400 })
  if (!found) return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  return NextResponse.json({ store, id })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
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
  }, frameId)
  if (!found) return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  return NextResponse.json({ store, id })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const store = await mutateStore((s) => {
    s.albums = s.albums.filter((a) => a.id !== id)
    for (const layout of s.layouts) {
      if (layout.settings.albumId === id) layout.settings.albumId = null
    }
  }, frameId)
  return NextResponse.json({ store })
}
