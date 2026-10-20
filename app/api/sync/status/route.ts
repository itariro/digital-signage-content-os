import { NextResponse } from 'next/server'
import { pendingCount } from '@/lib/sync/queue'
import { getSyncState } from '@/lib/sync/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    queueDepth: await pendingCount(),
    ...getSyncState(),
  })
}
