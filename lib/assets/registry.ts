import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'

export interface AssetInput { type: string; name: string; mime: string; size: number; hash: string; source?: string }

export async function registerAsset(input: AssetInput) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const existing = await db.select().from(assets).where(eq(assets.hash, input.hash))
  if (existing.length) return existing[0]
  const now = new Date()
  const row = { id: nanoid(), type: input.type, name: input.name, mime: input.mime, size: input.size, hash: input.hash, version: 1, createdAt: now, updatedAt: now, refCount: 0, source: input.source ?? 'local' }
  try {
    await db.insert(assets).values(row)
  } catch {
    const again = await db.select().from(assets).where(eq(assets.hash, input.hash))
    if (again.length) return again[0]
  }
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
  await db.update(assets).set({ refCount: sql`max(0, ref_count + ${delta})`, updatedAt: new Date() }).where(eq(assets.id, id))
}
