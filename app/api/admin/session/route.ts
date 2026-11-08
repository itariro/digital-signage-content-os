import { NextResponse } from 'next/server'
import { adminAuthEnabled, requestHasAdmin } from '@/lib/frame-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const configured = adminAuthEnabled()
  const authenticated = configured && await requestHasAdmin(request.headers)
  return NextResponse.json(
    { configured, authenticated },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
