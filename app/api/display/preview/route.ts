import { NextRequest, NextResponse } from 'next/server'
import { getDecision } from '@/lib/engine/state'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const frameId = req.nextUrl.searchParams.get('frame') || 'home'

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  let body: { dateTime?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.dateTime || typeof body.dateTime !== 'string') {
    return NextResponse.json({ error: 'dateTime is required' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(body.dateTime)) {
    return NextResponse.json({ error: 'dateTime must be a timezone-less ISO string' }, { status: 400 })
  }

  try {
    const { decision, context } = await getDecision(frameId, new Date(), {
      simulatedWallTime: body.dateTime,
      recordHistory: false,
    })
    return NextResponse.json(
      {
        decision,
        context,
        warning: 'This preview does not account for display history. The real decision may differ.',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[display/preview] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
