import { NextResponse } from 'next/server'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore, readStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { ensureCanvasLibrary, getCanvasLayoutPhase, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
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
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid layout')
  }
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.layouts.find((layout) => layout.id === id)
  if (!existing) return invalid('Layout not found', 404)
  const isCanvas = parsed.data.kind === 'canvas'
  if (library !== isCanvas || library !== (existing.kind === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }

  let found = false
  const store = await mutateStore((s) => {
    const layout = s.layouts.find((entry) => entry.id === id)
    if (!layout) return
    found = true
    Object.assign(layout, parsed.data, { updatedAt: new Date().toISOString() })
  }, frameId)
  if (!found) return invalid('Layout not found', 404)
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
  const existing = existingStore?.layouts.find((layout) => layout.id === id)
  if (!existing) return invalid('Layout not found', 404)
  if (library !== (existing.kind === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }
  if (library) {
    const phase = await getCanvasLayoutPhase(id)
    if (phase === 'scheduled' || phase === 'live') {
      return NextResponse.json({ error: 'Release this canvas before deleting it', code: 'E_LIVE' }, { status: 409 })
    }
  }

  let blocked = false
  const store = await mutateStore((s) => {
    if (!library && s.layouts.length <= 1) {
      blocked = true
      return
    }
    s.layouts = s.layouts.filter((layout) => layout.id !== id)
    if (!library && s.activeId === id) s.activeId = s.layouts[0]?.id ?? null
  }, frameId)
  if (blocked) return invalid('Keep at least one layout')
  return NextResponse.json({ store })
}
