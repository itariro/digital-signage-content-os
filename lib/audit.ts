import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { nanoid } from 'nanoid'

export async function audit(actor: string, action: string, targetType: string, targetId: string, details?: unknown) {
  const db = getDb()
  const { auditLog } = getTables()
  await db.insert(auditLog).values({
    id: nanoid(12),
    actor,
    action,
    targetType,
    targetId,
    details: details ?? null,
    createdAt: new Date(),
  })
}

export async function listAudit(limit = 100) {
  const db = getDb()
  const { auditLog } = getTables()
  const rows = await db.select().from(auditLog)
  return rows.slice(-limit).reverse()
}
