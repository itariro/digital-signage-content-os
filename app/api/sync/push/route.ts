import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkCompatibility, API_VERSION } from '@/lib/sync/compat'
import { authenticateInstance } from '@/lib/sync/auth'
import { handlePush } from '@/lib/sync/server'

const changeSchema = z.object({
  idempotencyKey: z.string().min(1).max(120),
  entityType: z.string().min(1).max(60),
  entityId: z.string().min(1).max(64),
  operation: z.enum(['upsert', 'delete']),
  payload: z.unknown().optional(),
  baseRevision: z.number().int().optional(),
})

// instanceId in the body is accepted for backward compatibility but ignored:
// identity comes from the authenticated bearer token.
const bodySchema = z.object({
  instanceId: z.string().min(1).max(64).optional(),
  apiVersion: z.string().min(1).max(20),
  changes: z.array(changeSchema).max(100),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })

  const { apiVersion, changes } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const outcome = await handlePush(instanceId, changes)
  return NextResponse.json(outcome)
}
