import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkCompatibility, API_VERSION } from '@/lib/sync/compat'
import { authenticateInstance } from '@/lib/sync/auth'
import { handlePull } from '@/lib/sync/server'

// instanceId in the query is accepted for backward compatibility but ignored:
// the requested scope derives from the authenticated bearer token.
const querySchema = z.object({
  instanceId: z.string().min(1).max(64).optional(),
  since: z.string().optional(),
  apiVersion: z.string().min(1).max(20).default(API_VERSION),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid query' }, { status: 400 })

  const { since, apiVersion } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const outcome = await handlePull(instanceId, since)
  if (outcome.expired) {
    return NextResponse.json({ changes: [], cursor: outcome.cursor, reset: true }, { status: 410 })
  }
  return NextResponse.json({ changes: outcome.changes, cursor: outcome.cursor })
}
