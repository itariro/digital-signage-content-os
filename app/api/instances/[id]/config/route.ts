import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { adminOk } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!adminOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
  await audit('admin', 'push_config', 'instance', id, { keys: Object.keys(body) })
  return NextResponse.json({ ok: true })
}
