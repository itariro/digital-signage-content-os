import { NextRequest, NextResponse } from 'next/server'
import { adminAuthEnabled, requestHasAdmin } from '@/lib/frame-admin'

export const dynamic = 'force-dynamic'

// Node-runtime admin check used by the edge middleware (proxy.ts) so that
// FRAME_ADMIN_SECRET/FRAME_ADMIN_HASH loaded from frame.env by the kiosk
// service are actually consulted. The middleware runs in the edge runtime,
// where those runtime env vars may not be visible.
export async function GET(request: NextRequest) {
  if (!adminAuthEnabled()) {
    return NextResponse.json({ error: 'admin_password_not_configured' }, { status: 401 })
  }
  if (await requestHasAdmin(request.headers)) {
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
