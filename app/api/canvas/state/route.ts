import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { getCanvasClock, SYSTEM_CLOCK } from '@/lib/canvas/clock-service'
import { getCanvasState } from '@/lib/canvas/state-store'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const entityId = remoteEntityId(frameId)
  const [row, frameRows] = await Promise.all([
    getCanvasState(entityId),
    getDb().select().from(getTables().frameDocuments).where(eq(getTables().frameDocuments.identifier, entityId)).limit(1),
  ])
  const frame = frameRows[0]
  const clock = process.env.INSTANCE_ID ? getCanvasClock() : SYSTEM_CLOCK
  return NextResponse.json(
    {
      revision: row?.revision ?? 0,
      state: row?.data ?? null,
      clock,
      frame: frame ? { screenWidthMm: frame.screenWidthMm ?? null, screenHeightMm: frame.screenHeightMm ?? null } : null,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
