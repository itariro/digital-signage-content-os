import { NextRequest, NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { resolveActor } from '@/lib/http-auth'
import { revokeInstance } from '@/lib/console/service'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  await revokeInstance(id)
  await audit(outcome.actor, 'revoke_instance', 'instance', id, {})
  return NextResponse.json({ ok: true })
}
