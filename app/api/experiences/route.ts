import { NextResponse } from 'next/server'
import { mutateStore } from '@/lib/store'
import { safeParseExperiences } from '@/lib/schema'
import { frameIdParam } from '@/lib/frames/request'

export async function PUT(request: Request) {
  const frameId = frameIdParam(request.url)
  const parsed = safeParseExperiences(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid experiences' }, { status: 400 })
  }
  const store = await mutateStore((s) => {
    s.experiences = parsed.data
  }, frameId)
  return NextResponse.json({ store })
}
