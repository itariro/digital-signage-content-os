import { NextRequest, NextResponse } from 'next/server'
import type { AdminConflict } from '@/lib/console/admin-types'
import { resolveActor } from '@/lib/http-auth'
import { listConflicts } from '@/lib/sync/conflicts'

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

  const rows = await listConflicts()
  const conflicts: AdminConflict[] = rows
    .filter((row) => row.status === 'open' || row.status === 'rejected')
    .map(({ id, instanceId, entityType, entityId, localRevision, remoteRevision, status, createdAt }) => ({
      id,
      instanceId,
      entityType,
      entityId,
      localRevision,
      remoteRevision,
      status: status as AdminConflict['status'],
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    }))

  return NextResponse.json({ conflicts }, { headers: { 'Cache-Control': 'no-store' } })
}
