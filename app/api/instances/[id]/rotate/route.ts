import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { audit } from '@/lib/audit'
import { resolveActor } from '@/lib/http-auth'
import { issueEnrollmentCode } from '@/lib/console/enroll'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const db = getDb()
  const t = getTables()
  const found = await db.select({ id: t.instances.id }).from(t.instances).where(eq(t.instances.id, id))
  if (!found.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const issued = await issueEnrollmentCode(id)
  await audit(outcome.actor, 'rotate_instance_code', 'instance', id, {})
  return NextResponse.json({ instanceId: issued.instanceId, enrollmentCode: issued.code, expiresAt: issued.expiresAt })
}
