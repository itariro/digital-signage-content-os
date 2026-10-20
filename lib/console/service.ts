import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { hashToken } from '@/lib/sync/auth'

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
 * Register a device: mint id + one-time bearer token (only the hash is
 * stored) and seed its frame document. Returns the plaintext token exactly
 * once (spec §9 redeem flow).
 */
export async function registerInstance(name?: string): Promise<{ instanceId: string; deviceToken: string }> {
  const db = getDb()
  const tables = getTables()
  const id = nanoid(12)
  const token = nanoid(32)
  await db.insert(tables.instances).values({
    id,
    deviceTokenHash: hashToken(token),
    createdAt: new Date(),
  })
  const existing = await db.select({ id: tables.frameDocuments.id }).from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  if (!existing.length) {
    const { seed } = await import('@/lib/store')
    const now = new Date()
    await db.insert(tables.frameDocuments).values({
      id, identifier: id, name: name ?? `Frame ${id}`, data: seed(),
      createdAt: now, updatedAt: now, revision: 1, resolutionWidth: 1920, resolutionHeight: 1080,
    })
  }
  return { instanceId: id, deviceToken: token }
}

export async function revokeInstance(id: string): Promise<void> {
  const db = getDb()
  const tables = getTables()
  await db.delete(tables.instances).where(eq(tables.instances.id, id))
}
