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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!adminOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const db = getDb() as any
  const tables = getTables() as any
  await db.delete(tables.instances).where(eq(tables.instances.id, id))
  await audit('admin', 'revoke_instance', 'instance', id, {})
  return NextResponse.json({ ok: true })
}
