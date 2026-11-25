import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canvasActor, canvasErrorResponse } from '@/lib/canvas/http'
import { releaseCanvas } from '@/lib/canvas/service'

export const dynamic = 'force-dynamic'

const releaseSchema = z.object({
  layoutId: z.string().min(1).max(40),
  leadMs: z.number().int().min(0).max(600_000).optional(),
}).strict()

export async function POST(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response
  const parsed = releaseSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid release request' },
      { status: 400 },
    )
  }

  const result = await releaseCanvas({ ...parsed.data, actor: gate.actor })
  if (!result.ok) return canvasErrorResponse(result)
  return NextResponse.json(result)
}
