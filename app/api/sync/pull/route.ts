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
  cvRev: z.coerce.number().int().min(0).optional(),
  cvApplied: z.coerce.number().int().min(0).optional(),
  cvOff: z.coerce.number().optional(),
  cvUnc: z.coerce.number().optional(),
  vw: z.coerce.number().int().optional(),
  vh: z.coerce.number().int().optional(),
  fps: z.coerce.number().optional(),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid query' }, { status: 400 })

  const { since, apiVersion, cvRev, cvApplied, cvOff, cvUnc, vw, vh, fps } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const hasReport = [cvApplied, cvOff, cvUnc, vw, vh, fps].some((value) => value !== undefined)
  const outcome = await handlePull(instanceId, since, {
    cvRev: cvRev ?? 0,
    report: hasReport
      ? {
          appliedRevision: cvApplied ?? null,
          clockOffsetMs: cvOff ?? null,
          clockUncertaintyMs: cvUnc ?? null,
          viewportW: vw ?? null,
          viewportH: vh ?? null,
          fpsAvg: fps ?? null,
        }
      : undefined,
  })

  const body = {
    changes: outcome.changes,
    cursor: outcome.cursor,
    resolvedConflicts: outcome.resolvedConflicts,
    serverTime: outcome.serverTime,
    ...(outcome.canvas ? { canvas: outcome.canvas } : {}),
  }
  if (outcome.expired) return NextResponse.json({ ...body, changes: [], reset: true }, { status: 410 })
  return NextResponse.json(body)
}
