import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditSafe } from '@/lib/audit'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { redeemEnrollmentCode } from '@/lib/console/enroll'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ code: z.string().min(10).max(64) })

// Public: a frame redeems its one-time enrollment code and receives its
// bundle. TLS at the edge; nothing here echoes code state (spec §3.2).
export async function POST(request: NextRequest) {
  const ip = clientKey(request)
  const limit = checkLimit(`enroll:${ip}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const bundle = await redeemEnrollmentCode(parsed.data.code)
  if (!bundle) {
    await auditSafe({
      actor: 'enroll',
      action: 'enroll_rejected',
      targetType: 'instance',
      targetId: 'unknown',
      details: { ip },
    })
    return NextResponse.json({ error: 'invalid or expired code' }, { status: 401 })
  }
  await auditSafe({
    actor: 'enroll',
    action: 'enroll_redeemed',
    targetType: 'instance',
    targetId: bundle.instanceId,
    details: { ip },
  })
  const origin = new URL(request.url).origin
  return NextResponse.json({
    instanceId: bundle.instanceId,
    deviceToken: bundle.deviceToken,
    syncEndpoint: `${origin}/api/sync`,
    frameAdminSecret: bundle.frameAdminSecret,
    config: { clerkPublishableKey: bundle.clerkPublishableKey },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
