import { NextRequest, NextResponse } from 'next/server'
import { getDecision, FrameNotFoundError } from '@/lib/engine/state'
import { frameIdParam } from '@/lib/frames/request'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const frameId = frameIdParam(req.nextUrl) ?? 'home'

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  try {
    const { decision, context, store } = await getDecision(frameId)
    return NextResponse.json(
      { decision, context, store },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    if (error instanceof FrameNotFoundError) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }
    console.error('[display/state] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
