import { NextResponse, after } from 'next/server'
import { readStore } from '@/lib/store'
import { tickBobEngine } from '@/lib/bob-bridge'
import { frameIdParam } from '@/lib/frames/request'
import { isLibraryFrame } from '@/lib/canvas/library'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  }
  const store = await readStore(frameId)
  if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  // The library is an authoring document, not a display. Driving Bob would
  // publish a notification the library can never show.
  if (!isLibraryFrame(frameId)) {
    after(async () => {
      await tickBobEngine(frameId)
    })
  }
  return NextResponse.json(store, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
