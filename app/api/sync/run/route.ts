import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDatabaseMode } from '@/lib/db/mode'
import { runSyncCycle } from '@/lib/sync/client'

const bodySchema = z.object({
  endpoint: z.string().url(),
  token: z.string().min(1),
  instanceId: z.string().min(1),
  checkpoint: z.string().optional(),
  intervalMinutes: z.number().int().min(1).optional(),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (getDatabaseMode() !== 'sqlite') {
    return NextResponse.json({ error: 'instance mode required' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })
  const { endpoint, token, instanceId, checkpoint } = parsed.data
  try {
    const cursor = await runSyncCycle({ endpoint, token, instanceId }, checkpoint)
    return NextResponse.json({ ok: true, cursor })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 })
  }
}
