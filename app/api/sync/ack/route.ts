import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateInstance } from '@/lib/sync/auth'

const bodySchema = z.object({
  instanceId: z.string().min(1).max(64),
  keys: z.array(z.string().min(1).max(120)).max(500),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })

  return NextResponse.json({ ok: true, acknowledged: parsed.data.keys.length })
}
