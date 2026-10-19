import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { checkCompatibility, API_VERSION } from '@/lib/sync/compat'
import { authenticateInstance } from '@/lib/sync/auth'

const querySchema = z.object({
  instanceId: z.string().min(1).max(64),
  since: z.string().optional(),
  apiVersion: z.string().min(1).max(20).default(API_VERSION),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid query' }, { status: 400 })

  const { since, apiVersion } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const db = getDb() as any
  const tables = getTables() as any
  const rows = await db.select().from(tables.frameDocuments)
  let filtered = rows
  if (since) {
    const sinceDate = new Date(since)
    if (!Number.isNaN(sinceDate.getTime())) {
      filtered = rows.filter((r: any) => new Date(r.updatedAt).getTime() > sinceDate.getTime())
    } else {
      // invalid cursor -> full resync
      filtered = rows
    }
  }

  const changes = filtered.map((r: any) => ({
    entityType: 'frame_document',
    entityId: r.identifier,
    operation: 'upsert',
    payload: r.data,
    revision: r.revision ?? 1,
    updatedAt: new Date(r.updatedAt).toISOString(),
  }))

  const cursor = changes.length
    ? changes.reduce((a: string, c: any) => (new Date(c.updatedAt).getTime() > new Date(a).getTime() ? c.updatedAt : a), since || new Date(0).toISOString())
    : (since || new Date().toISOString())

  return NextResponse.json({ changes, cursor })
}
