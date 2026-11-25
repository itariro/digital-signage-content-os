import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canvasActor, canvasErrorResponse } from '@/lib/canvas/http'
import { identifyCanvas } from '@/lib/canvas/service'

export const dynamic = 'force-dynamic'

const identifySchema = z.object({
  layoutId: z.string().min(1).max(40),
  seconds: z.number().int().min(0).max(120),
}).strict()

export async function POST(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response
  const parsed = identifySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid identify request' },
      { status: 400 },
    )
  }

  const result = await identifyCanvas({ ...parsed.data, actor: gate.actor })
  if (!result.ok) return canvasErrorResponse(result)
  return NextResponse.json(result)
}
