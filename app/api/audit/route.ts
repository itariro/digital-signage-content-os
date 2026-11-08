import { NextRequest, NextResponse } from 'next/server'
import type { AdminAuditEntry } from '@/lib/console/admin-types'
import { resolveActor } from '@/lib/http-auth'
import { listAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.reason },
      {
        status: outcome.reason === 'misconfigured' ? 500 : 401,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }

  const rows = await listAudit(20)
  const entries: AdminAuditEntry[] = rows.map(({ id, actor, action, targetType, targetId, createdAt }) => ({
    id,
    actor,
    action,
    targetType,
    targetId,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
  }))

  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } })
}
