import { NextResponse } from 'next/server'
import { readStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? 'home'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  }
  return NextResponse.json(await readStore(frameId))
}
