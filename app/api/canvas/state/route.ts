import { NextResponse } from 'next/server'
import { getCanvasClock, SYSTEM_CLOCK } from '@/lib/canvas/clock-service'
import { getCanvasState } from '@/lib/canvas/state-store'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const row = await getCanvasState(remoteEntityId(frameId))
  const clock = process.env.INSTANCE_ID ? getCanvasClock() : SYSTEM_CLOCK
  return NextResponse.json(
    { revision: row?.revision ?? 0, state: row?.data ?? null, clock },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
