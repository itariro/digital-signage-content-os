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

export interface DecisionRecord {
  id: string
  layoutId: string
  score: number
}

/**
 * Persists a decision, pruning the frame's expired history in the same
 * transaction.
 *
 * Spec §5.2 requires the retention `DELETE` and the idempotent `INSERT` to be
 * atomic: a crash between them must not leave pruning applied without the new
 * row (or vice versa). `shownAt` is truncated to the nearest minute so the
 * `UNIQUE (frame_id, decision_id, shown_at)` constraint makes retries within
 * the same minute idempotent.
 */
export async function recordDecision(
  frameId: string,
  decision: DecisionRecord,
  shownAt: Date
): Promise<void> {
  const db = getDb()
  const shownAtMinute = new Date(Math.floor(shownAt.getTime() / 60000) * 60000)
  const cutoff = new Date(Date.now() - RETENTION_MS)
  await db.transaction(async tx => {
    await tx
      .delete(displayHistory)
      .where(and(eq(displayHistory.frameId, frameId), lt(displayHistory.shownAt, cutoff)))
    await tx
      .insert(displayHistory)
      .values({
        frameId,
        decisionId: decision.id,
        layoutId: decision.layoutId,
        shownAt: shownAtMinute,
        score: decision.score,
      })
      .onConflictDoNothing({
        target: [displayHistory.frameId, displayHistory.decisionId, displayHistory.shownAt],
      })
  })
}

/**
 * Deletes history rows older than the 7-day retention window. Used on decision
 * requests that do not append a row (fallback / experiences disabled); requests
 * that do append prune inside `recordDecision` instead.
 */
export async function pruneHistory(frameId: string): Promise<void> {
  const db = getDb()
  const cutoff = new Date(Date.now() - RETENTION_MS)
  await db
    .delete(displayHistory)
    .where(and(eq(displayHistory.frameId, frameId), lt(displayHistory.shownAt, cutoff)))
}
