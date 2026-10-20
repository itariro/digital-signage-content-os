import { NextRequest, NextResponse } from 'next/server'
import { getDecision, FrameNotFoundError } from '@/lib/engine/state'
import { readStore } from '@/lib/store'
import { safeParseExperiences } from '@/lib/schema'
import { formatZonedInputValue, resolveTimezone } from '@/lib/zoned-time'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

/** The frame's current wall time, so the editor pre-fills in frame-local time. */
export async function GET(req: NextRequest) {
  const frameId = frameIdParam(req.nextUrl) ?? 'home'
  if (!FRAME_ID.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }
  // The editor may be previewing an unsaved timezone; prefer it over the stored
  // one so the pre-filled wall time matches the zone the preview will use.
  const tzOverride = req.nextUrl.searchParams.get('tz')
  try {
    const store = await readStore(frameId)
    if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    const timezone = resolveTimezone(tzOverride || store.experiences.settings.timezone)
    return NextResponse.json({ frameLocalNow: formatZonedInputValue(new Date(), timezone) })
  } catch (error) {
    console.error('[display/preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const operator = await requireHostedOperator(req)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const frameId = frameIdParam(req.nextUrl) ?? 'home'

  if (!FRAME_ID.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  let body: { dateTime?: string; experiences?: unknown; selection?: 'layout' | 'notification' }
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

  if (body.selection !== undefined && body.selection !== 'layout' && body.selection !== 'notification') {
    return NextResponse.json({ error: 'selection must be "layout" or "notification"' }, { status: 400 })
  }

  // Optional draft: the editor previews unsaved experiences without writing them.
  const draft = body.experiences === undefined
    ? null
    : safeParseExperiences(body.experiences)
  if (body.experiences !== undefined && !draft?.success) {
    return NextResponse.json({ error: 'Invalid experiences draft' }, { status: 400 })
  }

  try {
    const { decision, context } = await getDecision(frameId, new Date(), {
      simulatedWallTime: body.dateTime,
      recordHistory: false,
      selection: body.selection,
      experiencesOverride: draft?.success ? draft.data : undefined,
    })
    return NextResponse.json(
      {
        decision,
        context,
        warning: 'This preview does not account for display history. The real decision may differ.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof FrameNotFoundError) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }
    console.error('[display/preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
