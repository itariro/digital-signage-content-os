import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

export interface AssetInput { type: string; name: string; mime: string; size: number; hash: string; source?: string }

export async function registerAsset(input: AssetInput) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const existing = await db.select().from(assets).where(eq(assets.hash, input.hash))
  if (existing.length) return existing[0]
  const now = new Date().toISOString()
  const row = { id: nanoid(), type: input.type, name: input.name, mime: input.mime, size: input.size, hash: input.hash, version: 1, createdAt: now, updatedAt: now, refCount: 0, source: input.source ?? 'local' }
  await db.insert(assets).values(row)
  return row
}

export async function getAsset(id: string) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const rows = await db.select().from(assets).where(eq(assets.id, id))
  return rows[0] ?? null
}

export async function adjustRefCount(id: string, delta: number) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const a = await getAsset(id)
  if (!a) return
  await db.update(assets).set({ refCount: Math.max(0, a.refCount + delta), updatedAt: new Date().toISOString() }).where(eq(assets.id, id))
}
