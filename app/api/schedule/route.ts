import { NextResponse } from 'next/server'
import { mutateStore } from '@/lib/store'
import { scheduleSchema } from '@/lib/schema'
import { frameIdParam } from '@/lib/frames/request'

export async function PUT(request: Request) {
  const frameId = frameIdParam(request.url)
  const parsed = scheduleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid schedule' }, { status: 400 })
  }
  const store = await mutateStore((s) => {
    s.schedule = parsed.data
  }, frameId)
  return NextResponse.json({ store })
}
