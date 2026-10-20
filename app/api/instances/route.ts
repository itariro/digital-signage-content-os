import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { auth } from '@clerk/nextjs/server'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { hashToken } from '@/lib/sync/auth'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/authz'

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
  const db = getDb() as any
  const tables = getTables() as any
  const instances = await db.select().from(tables.instances)
  // enrich with frame doc info
  const frames = await db.select().from(tables.frameDocuments)
  const frameMap = new Map(frames.map((f: any) => [f.identifier, f]))
  const enriched = instances.map((i: any) => ({
    ...i,
    deviceTokenHash: undefined,
    frame: frameMap.get(i.id) ? { identifier: (frameMap.get(i.id) as any).identifier, name: (frameMap.get(i.id) as any).name, updatedAt: (frameMap.get(i.id) as any).updatedAt, revision: (frameMap.get(i.id) as any).revision } : null,
  }))
  return NextResponse.json({ instances: enriched })
}

export async function POST(request: NextRequest) {
  // Console humans act with their Clerk session; automation with x-admin-token.
  const gate = requireAdmin(request)
  const { userId } = await auth()
  if (!userId && !gate.ok) return gateFailure(gate)
  const actor = userId ?? (gate.ok ? gate.actor : 'unauthenticated')
  const parsed = registerSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })
  const db = getDb() as any
  const tables = getTables() as any
  const id = nanoid(12)
  const token = nanoid(32)
  await db.insert(tables.instances).values({
    id,
    deviceTokenHash: hashToken(token),
    createdAt: new Date(),
  })
  // ensure a frame document exists for this instance
  const existing = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  if (!existing.length) {
    const { seed } = await import('@/lib/store')
    const store = seed()
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id, identifier: id, name: parsed.data.name ?? `Frame ${id}`, data: store, createdAt: now, updatedAt: now, revision: 1, resolutionWidth: 1920, resolutionHeight: 1080,
    })
  }
  await audit(actor, 'register_instance', 'instance', id, { name: parsed.data.name })
  return NextResponse.json({ instanceId: id, deviceToken: token }, { status: 201 })
}
