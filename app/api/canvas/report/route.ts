import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { recordDisplayReport } from '@/lib/canvas/reporter'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

const reportSchema = z.object({
  appliedRevision: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  viewportW: z.number().int().min(1).max(100_000).nullable().optional(),
  viewportH: z.number().int().min(1).max(100_000).nullable().optional(),
  fpsAvg: z.number().min(0).max(240).nullable().optional(),
})

export async function POST(request: NextRequest) {
  const frameId = frameIdParam(request.nextUrl) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const limit = checkLimit(`canvas-report:${clientKey(request)}`, 60, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid report' }, { status: 400 })

  recordDisplayReport(remoteEntityId(frameId), {
    appliedRevision: parsed.data.appliedRevision ?? null,
    viewportW: parsed.data.viewportW ?? null,
    viewportH: parsed.data.viewportH ?? null,
    fpsAvg: parsed.data.fpsAvg ?? null,
  })
  return new NextResponse(null, { status: 204 })
}
