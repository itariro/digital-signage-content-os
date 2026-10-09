import { NextResponse } from 'next/server'
import { z } from 'zod'
import { mutateStore, readStore } from '@/lib/store'
import { clockParts, resolveDisplay } from '@/lib/schedule'

function validZone(tz: string | null) {
  if (!tz) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return undefined
  }
}

export async function GET(request: Request) {
  const store = await readStore()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  const timeZone = validZone(new URL(request.url).searchParams.get('tz'))
  const { layout, rule, night } = resolveDisplay(store, clockParts(new Date(), timeZone))
  return NextResponse.json({
    layout,
    scheduledBy: rule?.id ?? null,
    night: night ? store.schedule.night : null,
  })
}

export async function PUT(request: Request) {
  const parsed = z.object({ id: z.string().min(1).max(40) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const store = await mutateStore((s) => {
    if (s.layouts.some((l) => l.id === parsed.data.id)) s.activeId = parsed.data.id
  })
  return NextResponse.json({ store })
}
