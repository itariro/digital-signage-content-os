import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/lib/http-auth'
import { resolveConflict } from '@/lib/sync/conflicts'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const resolutionSchema = z.enum(['local', 'remote'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(req)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  const form = await req.formData().catch(() => null)
  const parsed = resolutionSchema.safeParse(form?.get('resolution'))
  if (!parsed.success) return NextResponse.json({ error: 'resolution must be local or remote' }, { status: 400 })

  const resolved = await resolveConflict(id, parsed.data, outcome.actor)
  if (!resolved) return NextResponse.json({ error: 'conflict not found or already resolved' }, { status: 404 })
  await audit(outcome.actor, 'resolve_conflict', 'conflict', id, { resolution: parsed.data, entityId: resolved.entityId })
  return NextResponse.json({ ok: true })
}
