import { NextResponse, after } from 'next/server'
import { readStore } from '@/lib/store'
import { tickBobEngine } from '@/lib/bob-bridge'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? 'home'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  }
  const store = await readStore(frameId)
  if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  // Drive the Bob engine after the response is sent; it publishes winning
  // speech as a frame notification which this frame picks up on its next
  // poll. `after` keeps the background work running past the response on both
  // the Node server and serverless runtimes.
  after(async () => {
    await tickBobEngine(frameId)
  })
  return NextResponse.json(store, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
