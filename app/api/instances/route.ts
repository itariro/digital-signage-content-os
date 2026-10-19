import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { hashToken } from '@/lib/sync/auth'
import { audit } from '@/lib/audit'

function adminOk(request: NextRequest) {
  const token = process.env.CONSOLE_ADMIN_TOKEN
  if (!token) return true // dev mode open
  return request.headers.get('x-admin-token') === token
}

const registerSchema = z.object({ name: z.string().min(1).max(120).optional() })

export const dynamic = 'force-dynamic'

export async function GET() {
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
  if (!adminOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
  await audit('admin', 'register_instance', 'instance', id, { name: parsed.data.name })
  return NextResponse.json({ instanceId: id, deviceToken: token }, { status: 201 })
}
