import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { checkCompatibility, API_VERSION } from '@/lib/sync/compat'
import { authenticateInstance } from '@/lib/sync/auth'
import { recordConflict } from '@/lib/sync/conflicts'

const changeSchema = z.object({
  idempotencyKey: z.string().min(1).max(120),
  entityType: z.string().min(1).max(60),
  entityId: z.string().min(1).max(64),
  operation: z.enum(['upsert', 'delete']),
  payload: z.unknown().optional(),
  baseRevision: z.number().int().optional(),
})

const bodySchema = z.object({
  instanceId: z.string().min(1).max(64),
  apiVersion: z.string().min(1).max(20),
  changes: z.array(changeSchema).max(100),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const instanceId = await authenticateInstance(request)
  if (!instanceId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })

  const { apiVersion, changes } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const db = getDb() as any
  const tables = getTables() as any
  const accepted: string[] = []
  const conflicts: any[] = []

  for (const c of changes) {
    // idempotency check
    const existingKey = await db.select().from(tables.idempotencyKeys).where(eq(tables.idempotencyKeys.key, c.idempotencyKey))
    if (existingKey.length) { accepted.push(c.idempotencyKey); continue }

    if (c.entityType === 'frame_document' && c.operation === 'upsert') {
      const [remote] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
      const remoteRev = remote?.revision ?? 0
      const baseRev = c.baseRevision ?? 0
      if (remote && remoteRev > baseRev && remoteRev !== (c.payload as any)?.revision) {
        // conflict
        const cf = await recordConflict({
          instanceId,
          entityType: c.entityType,
          entityId: c.entityId,
          localRevision: baseRev,
          remoteRevision: remoteRev,
          localPayload: c.payload,
          remotePayload: remote.data,
        })
        conflicts.push({ idempotencyKey: c.idempotencyKey, entityType: c.entityType, entityId: c.entityId, localRevision: baseRev, remoteRevision: remoteRev })
        // store key to avoid reprocessing
        await db.insert(tables.idempotencyKeys).values({ key: c.idempotencyKey, createdAt: new Date() })
        continue
      }
      // upsert
      const store = c.payload
      const now = new Date()
      if (remote) {
        await db.update(tables.frameDocuments).set({ data: store, updatedAt: now, revision: (remoteRev + 1) }).where(eq(tables.frameDocuments.identifier, c.entityId))
      } else {
        await db.insert(tables.frameDocuments).values({ id: c.entityId, identifier: c.entityId, name: (store as any)?.name ?? c.entityId, data: store, createdAt: now, updatedAt: now, revision: 1 })
      }
    } else if (c.entityType === 'frame_document' && c.operation === 'delete') {
      await db.delete(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, c.entityId))
    }

    await db.insert(tables.idempotencyKeys).values({ key: c.idempotencyKey, createdAt: new Date() })
    accepted.push(c.idempotencyKey)
  }

  return NextResponse.json({ accepted, conflicts } satisfies { accepted: string[]; conflicts: any[] })
}
