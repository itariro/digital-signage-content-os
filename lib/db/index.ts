import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { displayHistory } from './schema'
import type { HistorySummary } from '../engine/types'

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
 * Returns a bounded history summary for scoring:
 * - `recent`: rows inside the repetition/duration window (caller supplies it).
 * - `seenLayouts`: distinct layouts inside the 7-day novelty retention window.
 * - `latestLayoutId`: the most recently shown layout (the incumbent).
 *
 * The previous implementation loaded the entire 7-day table for the frame on
 * every 30s poll; this keeps the read proportional to the window.
 */
export async function queryHistory(
  frameId: string,
  now: Date,
  windowMs: number,
): Promise<HistorySummary> {
  const db = getDb()
  const windowStart = new Date(now.getTime() - windowMs)
  const retentionStart = new Date(now.getTime() - RETENTION_MS)

  const [recentRows, seenRows, latestRows] = await Promise.all([
    db
      .select({ layoutId: displayHistory.layoutId, ruleId: displayHistory.ruleId, shownAt: displayHistory.shownAt })
      .from(displayHistory)
      .where(and(eq(displayHistory.frameId, frameId), gte(displayHistory.shownAt, windowStart))),
    db
      .selectDistinct({ layoutId: displayHistory.layoutId })
      .from(displayHistory)
      .where(and(eq(displayHistory.frameId, frameId), gte(displayHistory.shownAt, retentionStart))),
    db
      .select({ layoutId: displayHistory.layoutId })
      .from(displayHistory)
      .where(eq(displayHistory.frameId, frameId))
      .orderBy(desc(displayHistory.shownAt))
      .limit(1),
  ])

  return {
    recent: recentRows.map(r => ({ layoutId: r.layoutId, ruleId: r.ruleId, shownAt: r.shownAt })),
    seenLayouts: new Set(seenRows.map(r => r.layoutId)),
    latestLayoutId: latestRows[0]?.layoutId ?? null,
  }
}

export interface DecisionRecord {
  id: string
  layoutId: string
  ruleId: string | null
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
        ruleId: decision.ruleId,
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
