import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = requireAdmin(request)
  const { userId } = await auth()
  if (!userId && !gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  const db = getDb() as any
  const tables = getTables() as any
  await db.delete(tables.instances).where(eq(tables.instances.id, id))
  await audit(userId ?? (gate.ok ? gate.actor : 'unauthenticated'), 'revoke_instance', 'instance', id, {})
  return NextResponse.json({ ok: true })
}
