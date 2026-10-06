import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { presetInputSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'

export async function POST(request: Request) {
  const parsed = presetInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid widget' }, { status: 400 })
  }
  const store = await mutateStore((s) => {
    s.presets = [{ id: nanoid(10), ...parsed.data, createdAt: new Date().toISOString() }, ...s.presets].slice(0, 100)
  })
  return NextResponse.json({ store })
}

export async function DELETE(request: Request) {
  const parsed = z.object({ id: z.string().min(1).max(40) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const store = await mutateStore((s) => {
    s.presets = s.presets.filter((p) => p.id !== parsed.data.id)
  })
  return NextResponse.json({ store })
}
