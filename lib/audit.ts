import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { nanoid } from 'nanoid'

export interface AuditEntry {
  actor: string
  action: string
  targetType: string
  targetId: string
  details?: unknown
}

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

// An audit row is not worth a lost device token. Callers on the enrollment
// path use this so an insert failure cannot turn a successful redeem into a
// 500 after the token was minted and the code burned.
export async function auditSafe(entry: AuditEntry, write: typeof audit = audit): Promise<void> {
  try {
    await write(entry.actor, entry.action, entry.targetType, entry.targetId, entry.details)
  } catch (error) {
    console.error('audit write failed', {
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      error,
    })
  }
}

export async function listAudit(limit = 100) {
  const db = getDb()
  const { auditLog } = getTables()
  const rows = await db.select().from(auditLog)
  return rows.slice(-limit).reverse()
}
