import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, adminAuthEnabled, signAdminSession, verifyAdminPassword } from '@/lib/frame-admin'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const dynamic = 'force-dynamic'

const body = z.object({ password: z.string().min(1).max(256) })

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

// Frame-only: the port gate (proxy.ts) routes POST /api/admin/login here from
// the management port; display-port traffic never sees this route.
export async function POST(request: NextRequest) {
  const ip = clientKey(request)
  const limit = checkLimit(`login:${ip}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  if (!adminAuthEnabled()) return unauthorized()

  const hash = process.env.FRAME_ADMIN_HASH!
  const secret = process.env.FRAME_ADMIN_SECRET!
  if (!verifyAdminPassword(parsed.data.password, hash)) return unauthorized()

  const token = await signAdminSession(secret)
  const res = NextResponse.json({ ok: true })
  res.headers.set('set-cookie', `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
