import { NextResponse } from 'next/server'
import { mutateStore } from '@/lib/store'
import { scheduleSchema } from '@/lib/schema'

export async function PUT(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? undefined
  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid schedule' }, { status: 400 })
  }
  const store = await mutateStore((s) => {
    s.schedule = parsed.data
  }, frameId)
  return NextResponse.json({ store })
}
