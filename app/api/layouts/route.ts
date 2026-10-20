import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const frameId = frameIdParam(request.url)
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid layout' }, { status: 400 })
  }
  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.layouts.length >= 50) throw new Error('Layout limit reached')
    s.layouts.push({ id, ...parsed.data, createdAt: now, updatedAt: now })
    if (!s.activeId) s.activeId = id
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return NextResponse.json({ error: store.message }, { status: 400 })
  return NextResponse.json({ store, id })
}
