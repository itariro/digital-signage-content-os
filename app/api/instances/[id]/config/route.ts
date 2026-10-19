import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { audit } from '@/lib/audit'

function adminOk(request: NextRequest) {
  const token = process.env.CONSOLE_ADMIN_TOKEN
  if (!token) return true
  return request.headers.get('x-admin-token') === token
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!adminOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const db = getDb() as any
  const tables = getTables() as any
  const [doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  if (!doc) return NextResponse.json({ error: 'instance not found' }, { status: 404 })
  const next = { ...doc.data, ...body }
  await db.update(tables.frameDocuments).set({ data: next, updatedAt: new Date() }).where(eq(tables.frameDocuments.identifier, id))
  await audit('admin', 'push_config', 'instance', id, { keys: Object.keys(body) })
  return NextResponse.json({ ok: true })
}
