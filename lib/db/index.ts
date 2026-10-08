import { and, eq, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { displayHistory } from './schema'
import type { HistoryEntry } from '../engine/types'

const globalForDb = globalThis as unknown as { framePool?: Pool }

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  return (globalForDb.framePool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }))
}

export function getDb() {
  return drizzle(getPool(), { schema })
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Returns the recent decision history for a frame, used to compute the
 * repetition penalty and novelty bonus when scoring candidates.
 */
export async function queryHistory(frameId: string): Promise<HistoryEntry[]> {
  const db = getDb()
  const rows = await db.select().from(displayHistory).where(eq(displayHistory.frameId, frameId))
  return rows.map(r => ({ layoutId: r.layoutId, shownAt: r.shownAt }))
}

/**
 * Appends a decision to the frame's history. `shownAt` is truncated to the
 * nearest minute so the `UNIQUE (frame_id, decision_id, shown_at)` constraint
 * makes retries within the same minute idempotent.
 */
export async function appendHistory(
  frameId: string,
  decisionId: string,
  layoutId: string,
  shownAt: Date,
  score: number
): Promise<void> {
  const db = getDb()
  const shownAtMinute = new Date(Math.floor(shownAt.getTime() / 60000) * 60000)
  await db
    .insert(displayHistory)
    .values({ frameId, decisionId, layoutId, shownAt: shownAtMinute, score })
    .onConflictDoNothing({
      target: [displayHistory.frameId, displayHistory.decisionId, displayHistory.shownAt],
    })
}

/** Deletes history rows older than the 7-day retention window. */
export async function pruneHistory(frameId: string): Promise<void> {
  const db = getDb()
  const cutoff = new Date(Date.now() - RETENTION_MS)
  await db
    .delete(displayHistory)
    .where(and(eq(displayHistory.frameId, frameId), lt(displayHistory.shownAt, cutoff)))
}
