import { NextRequest, NextResponse } from 'next/server'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const limit = checkLimit(`canvas-time:${clientKey(request)}`, 600, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  return NextResponse.json({ t: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
