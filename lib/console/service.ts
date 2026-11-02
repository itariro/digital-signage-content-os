import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'

export interface FrameSummary {
  identifier: string
  name: string
  updatedAt: Date | string | null
  revision: number | null
}

export interface InstanceCard {
  id: string
  createdAt: Date | string | null
  lastSeenAt: Date | string | null
  frame: FrameSummary | null
}

/**
 * Instances joined with their registered frame document (identifier ===
 * instance id). Console page and GET /api/instances shared this query and
 * the frameMap enrichment duplicated across both (Duplicated Code smell).
 */
export async function listInstanceCards(): Promise<InstanceCard[]> {
  const db = getDb()
  const tables = getTables()
  const instances = await db.select().from(tables.instances)
  const frames = await db.select().from(tables.frameDocuments)
  const frameMap = new Map(frames.map((f) => [f.identifier, f]))
  return instances.map((i) => {
    const f = frameMap.get(i.id)
    return {
      id: i.id,
      createdAt: i.createdAt ?? null,
      lastSeenAt: i.lastSeenAt ?? null,
      frame: f ? { identifier: f.identifier, name: f.name, updatedAt: f.updatedAt, revision: f.revision } : null,
    }
  })
}

/**
 * Register a device. Enrollment moved to lib/console/enroll: the admin API
 * returns only a one-time code now, and the plaintext token exists solely in
 * the /api/enroll response (spec §3).
 */
export async function registerInstance(name?: string): Promise<{ instanceId: string; enrollmentCode: string; expiresAt: Date }> {
  const { issueEnrollmentCode } = await import('@/lib/console/enroll')
  const issued = await issueEnrollmentCode()
  if (name) {
    const db = getDb()
    const tables = getTables()
    await db.update(tables.frameDocuments)
      .set({ name })
      .where(eq(tables.frameDocuments.identifier, issued.instanceId))
  }
  return { instanceId: issued.instanceId, enrollmentCode: issued.code, expiresAt: issued.expiresAt }
}

export async function revokeInstance(id: string): Promise<void> {
  const db = getDb()
  const tables = getTables()
  await db.delete(tables.instances).where(eq(tables.instances.id, id))
}
