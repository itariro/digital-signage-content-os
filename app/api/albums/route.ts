import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { albumCreateSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { defaultSlideshow } from '@/lib/albums'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { emptySyncTestScene } from '@/lib/canvas/defaults'
import { ensureCanvasLibrary, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = albumCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid album')
  }
  const isCanvas = parsed.data.theme === 'canvas'
  if (library !== isCanvas) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }
  if (library) await ensureCanvasLibrary()

  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.albums.length >= 40) throw new Error('Album limit reached')
    if (isCanvas) {
      s.albums.push({
        id,
        ...parsed.data,
        items: [],
        scenes: [emptySyncTestScene(nanoid(8))],
        slideshow: defaultSlideshow('canvas'),
        createdAt: now,
        updatedAt: now,
      })
      return
    }
    s.albums.push({
      id,
      ...parsed.data,
      items: [],
      slideshow: defaultSlideshow(parsed.data.theme),
      createdAt: now,
      updatedAt: now,
    })
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return invalid(store.message)
  return NextResponse.json({ store, id })
}
