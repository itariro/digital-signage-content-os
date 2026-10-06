import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mutateStore, readStore } from '@/lib/store'

export async function GET() {
  const store = await readStore()
  const layout = store.layouts.find((l) => l.id === store.activeId) ?? null
  return NextResponse.json({ layout })
}

export async function PUT(request: Request) {
  const parsed = z.object({ id: z.string().min(1).max(40) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const store = await mutateStore((s) => {
    if (s.layouts.some((l) => l.id === parsed.data.id)) s.activeId = parsed.data.id
  })
  return NextResponse.json({ store })
}
