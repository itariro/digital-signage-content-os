import { NextResponse } from 'next/server'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid layout' }, { status: 400 })
  }
  let found = false
  const store = await mutateStore((s) => {
    const layout = s.layouts.find((l) => l.id === id)
    if (!layout) return
    found = true
    Object.assign(layout, parsed.data, { updatedAt: new Date().toISOString() })
  }, frameId)
  if (!found) return NextResponse.json({ error: 'Layout not found' }, { status: 404 })
  return NextResponse.json({ store, id })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  let blocked = false
  const store = await mutateStore((s) => {
    if (s.layouts.length <= 1) {
      blocked = true
      return
    }
    s.layouts = s.layouts.filter((l) => l.id !== id)
    if (s.activeId === id) s.activeId = s.layouts[0]?.id ?? null
  }, frameId)
  if (blocked) return NextResponse.json({ error: 'Keep at least one layout' }, { status: 400 })
  return NextResponse.json({ store })
}
