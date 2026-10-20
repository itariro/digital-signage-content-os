import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getDatabaseMode } from './mode'
import { getTables, type Tables } from './tables'
import * as sqliteSchema from './schema.sqlite'
import { getSqliteDb } from './sqlite'
import { retentionCutoff, truncateToMinute } from './history-utils'
import type { HistorySummary } from '../engine/types'

const globalForDb = globalThis as unknown as { framePool?: Pool }

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  // Normalize sslmode to avoid pg-connection-string v3 deprecation warning:
  // 'require'/'prefer'/'verify-ca' are currently aliases for 'verify-full'.
  const url = process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)/g, 'sslmode=verify-full')
  return (globalForDb.framePool ??= new Pool({ connectionString: url, max: 5 }))
}

/**
 * Mode-dispatched database handle. See lib/db/tables.ts: one canonical
 * driver shape describes both dialects; the boundary cast lives in getDb.
 */
export type Database = NodePgDatabase<Tables>

export function getDb(): Database {
  if (getDatabaseMode() === 'sqlite') return getSqliteDb() as unknown as Database
  return drizzlePg(getPool(), { schema: getTables() }) as unknown as Database
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000



export async function queryHistory(
  frameId: string,
  now: Date,
  windowMs: number,
): Promise<HistorySummary> {
  const db = getDb()
  const windowStart = new Date(now.getTime() - windowMs)
  const retentionStart = new Date(now.getTime() - RETENTION_MS)
  const D = getTables().displayHistory

  const [recentRows, seenRows, latestRows] = await Promise.all([
    db.select({ layoutId: D.layoutId, ruleId: D.ruleId, shownAt: D.shownAt }).from(D)
      .where(and(eq(D.frameId, frameId), gte(D.shownAt, windowStart))),
    db.selectDistinct({ layoutId: D.layoutId }).from(D)
      .where(and(eq(D.frameId, frameId), gte(D.shownAt, retentionStart))),
    db.select({ layoutId: D.layoutId }).from(D)
      .where(eq(D.frameId, frameId))
      .orderBy(desc(D.shownAt))
      .limit(1),
  ])

  return {
    recent: recentRows.map((r) => ({ layoutId: r.layoutId, ruleId: r.ruleId, shownAt: r.shownAt })),
    seenLayouts: new Set(seenRows.map((r) => r.layoutId)),
    latestLayoutId: latestRows[0]?.layoutId ?? null,
  }
}

export interface DecisionRecord {
  id: string
  layoutId: string
  ruleId: string | null
  score: number
}

export async function recordDecision(
  frameId: string,
  decision: DecisionRecord,
  shownAt: Date
): Promise<void> {
  const db = getDb()
  const shownAtMinute = truncateToMinute(shownAt)
  const cutoff = retentionCutoff(new Date(), RETENTION_MS)
  const D = getTables().displayHistory
  const values = {
    frameId,
    decisionId: decision.id,
    layoutId: decision.layoutId,
    ruleId: decision.ruleId,
    shownAt: shownAtMinute,
    score: decision.score,
  }
  if (getDatabaseMode() === 'sqlite') {
    // better-sqlite3 transactions are SYNC-only: statements .run() inside
    // the callback (awaiting would escape the BEGIN..COMMIT scope).
    const D = sqliteSchema.displayHistory
    const sdb = getSqliteDb()
    sdb.transaction((tx) => {
      tx.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff))).run()
      tx.insert(D).values(values).onConflictDoNothing({
        target: [D.frameId, D.decisionId, D.shownAt],
      }).run()
    })
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff)))
      await tx.insert(D).values(values).onConflictDoNothing({
        target: [D.frameId, D.decisionId, D.shownAt],
      })
    })
  }
}

export async function pruneHistory(frameId: string): Promise<void> {
  const db = getDb()
  const cutoff = retentionCutoff(new Date(), RETENTION_MS)
  const D = getTables().displayHistory
  await db.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff)))
}
