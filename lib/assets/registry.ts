import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

export interface AssetInput { type: string; name: string; mime: string; size: number; hash: string; source?: string }

export async function registerAsset(input: AssetInput) {
  const db = getDb()
  const { assets } = getTables()
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
  const db = getDb()
  const { assets } = getTables()
  const rows = await db.select().from(assets).where(eq(assets.id, id))
  return rows[0] ?? null
}

export async function adjustRefCount(id: string, delta: number) {
  const db = getDb()
  const { assets } = getTables()
  const [row] = await db.select({ refCount: assets.refCount }).from(assets).where(eq(assets.id, id))
  if (!row) return
  // computed in JS: `max(0, ...)` is a scalar in sqlite but an AGGREGATE in
  // postgres (final review M4/I-3) — the same statement meant different
  // things per dialect.
  const refCount = Math.max(0, (row.refCount ?? 0) + delta)
  await db.update(assets).set({ refCount, updatedAt: new Date() }).where(eq(assets.id, id))
}
