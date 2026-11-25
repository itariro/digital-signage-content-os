import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
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
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid layout')
  }
  const isCanvas = parsed.data.kind === 'canvas'
  if (library !== isCanvas) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }
  if (library) await ensureCanvasLibrary()

  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.layouts.length >= 50) throw new Error('Layout limit reached')
    s.layouts.push({ id, ...parsed.data, createdAt: now, updatedAt: now })
    // The library has no active frame layout, so it must never gain an activeId.
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return invalid(store.message)
  return NextResponse.json({ store, id })
}
