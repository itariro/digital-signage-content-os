import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, adminAuthEnabled, signAdminSession, verifyAdminPassword } from '@/lib/frame-admin'
import { checkLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const body = z.object({ password: z.string().min(1).max(256) })

// Frame-only: the port gate (proxy.ts) routes POST /api/admin/login here from
// the management port; display-port traffic never sees this route.
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  const limit = checkLimit(`login:${ip}`, 10, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  if (!adminAuthEnabled() || !verifyAdminPassword(parsed.data.password, process.env.FRAME_ADMIN_HASH!)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  const token = await signAdminSession(process.env.FRAME_ADMIN_SECRET ?? '')
  res.headers.set('set-cookie', `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`)
  return res
}
