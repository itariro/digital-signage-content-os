import { NextResponse } from 'next/server'
import { mutateStore } from '@/lib/store'
import { experiencesSchema } from '@/lib/schema'

export async function PUT(request: Request) {
  const parsed = experiencesSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid experiences' }, { status: 400 })
  }
  const store = await mutateStore((s) => {
    s.experiences = parsed.data
  })
  return NextResponse.json({ store })
}
