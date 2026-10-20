import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@clerk/nextjs/server'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = requireAdmin(request)
  const { userId } = await auth()
  if (!userId && !gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const parsed = z.record(z.string(), z.unknown()).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const data = parsed.data
  const db = getDb() as any
  const tables = getTables() as any
  const [doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  if (!doc) return NextResponse.json({ error: 'instance not found' }, { status: 404 })
  const next = { ...doc.data, ...data }
  await db.update(tables.frameDocuments).set({ data: next, updatedAt: new Date() }).where(eq(tables.frameDocuments.identifier, id))
  await audit(userId ?? (gate.ok ? gate.actor : 'unauthenticated'), 'push_config', 'instance', id, { keys: Object.keys(body) })
  return NextResponse.json({ ok: true })
}
