import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/authz'
import { listInstanceCards, registerInstance } from '@/lib/console/service'

const registerSchema = z.object({ name: z.string().min(1).max(120).optional() })

export const dynamic = 'force-dynamic'

function gateFailure(gate: { ok: false; reason: string }) {
  const status = gate.reason === 'misconfigured' ? 500 : 401
  return NextResponse.json({ error: gate.reason }, { status })
}

export async function GET(request: NextRequest) {
  // Human (Clerk session) or automation (x-admin-token) — never anonymous.
  const { userId } = await auth()
  const gate = requireAdmin(request)
  if (!userId && !gate.ok) return gateFailure(gate)
  return NextResponse.json({ instances: await listInstanceCards() })
}

export async function POST(request: NextRequest) {
  // Console humans act with their Clerk session; automation with x-admin-token.
  const gate = requireAdmin(request)
  const { userId } = await auth()
  if (!userId && !gate.ok) return gateFailure(gate)
  const actor = userId ?? (gate.ok ? gate.actor : 'unauthenticated')
  const parsed = registerSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })
  const { instanceId, deviceToken } = await registerInstance(parsed.data.name)
  await audit(actor, 'register_instance', 'instance', instanceId, { name: parsed.data.name })
  return NextResponse.json({ instanceId, deviceToken }, { status: 201 })
}
