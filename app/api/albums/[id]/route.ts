import { NextResponse } from 'next/server'
import { albumItemSchema, albumUpdateSchema } from '@/lib/schema'
import { mutateStore, readStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { ensureCanvasLibrary, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const existing = (isLibraryFrame(frameId) ? await ensureCanvasLibrary() : await readStore(frameId))
    ?.albums.find((album) => album.id === id)
  if (existing?.theme === 'canvas') return invalid('Canvas albums have scenes, not artwork items')

  const body = await request.json().catch(() => null) as { item?: unknown } | null
  const parsed = albumItemSchema.safeParse(body?.item)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid album item')

  let found = false
  const store = await mutateStore((current) => {
    const album = current.albums.find((entry) => entry.id === id)
    if (!album) return
    found = true
    if (album.items.length >= 200) throw new Error('Album item limit reached')
    album.items.push(parsed.data)
    album.updatedAt = new Date().toISOString()
  }, frameId).catch((error: Error) => error)
  if (store instanceof Error) return invalid(store.message)
  if (!found) return invalid('Album not found', 404)
  return NextResponse.json({ store, id })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = albumUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid album')
  }
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.albums.find((album) => album.id === id)
  if (!existing) return invalid('Album not found', 404)
  const isCanvas = parsed.data.theme === 'canvas'
  if (library !== isCanvas || library !== (existing.theme === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }

  let found = false
  const store = await mutateStore((s) => {
    const album = s.albums.find((entry) => entry.id === id)
    if (!album) return
    found = true
    Object.assign(album, parsed.data, { updatedAt: new Date().toISOString() })
  }, frameId)
  if (!found) return invalid('Album not found', 404)
  return NextResponse.json({ store, id })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.albums.find((album) => album.id === id)
  if (!existing) return invalid('Album not found', 404)
  if (library !== (existing.theme === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }

  const store = await mutateStore((s) => {
    s.albums = s.albums.filter((album) => album.id !== id)
    for (const layout of s.layouts) {
      if (layout.settings.albumId === id) layout.settings.albumId = null
    }
  }, frameId)
  return NextResponse.json({ store })
}
