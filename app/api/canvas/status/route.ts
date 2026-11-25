import { NextRequest, NextResponse } from 'next/server'
import { STATUS_POLL_MS } from '@/lib/canvas/problems'
import { getCanvasStatus } from '@/lib/canvas/service'
import { resolveActor } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

const VALID_LAYOUT_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function GET(request: NextRequest) {
  if (process.env.INSTANCE_ID) {
    return NextResponse.json({ error: 'Canvas status is available on the console only' }, { status: 403 })
  }

  const actor = await resolveActor(request)
  if (!actor.ok) {
    return NextResponse.json(
      { error: actor.reason },
      { status: actor.reason === 'misconfigured' ? 500 : 401 },
    )
  }

  const rawLayoutId = request.nextUrl.searchParams.get('layoutId')?.trim()
  const layoutId = rawLayoutId || undefined
  if (layoutId && !VALID_LAYOUT_ID.test(layoutId)) {
    return NextResponse.json({ error: 'Invalid layoutId' }, { status: 400 })
  }

  const rows = await getCanvasStatus(layoutId ? { layoutId } : {})
  return NextResponse.json({ rows, serverNow: Date.now(), pollMs: STATUS_POLL_MS })
}
