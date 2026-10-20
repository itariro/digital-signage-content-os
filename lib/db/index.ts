import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getDatabaseMode } from './mode'
import { getSqliteDb } from './sqlite'
import { getTables } from './tables'
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

export function getDb() {
  if (getDatabaseMode() === 'sqlite') return getSqliteDb() as any
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = getTables()
  return drizzle(getPool(), { schema: schema as any })
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function tables() { return getTables() as any }
function dh() { return tables().displayHistory }

export async function queryHistory(
  frameId: string,
  now: Date,
  windowMs: number,
): Promise<HistorySummary> {
  const db = getDb()
  const windowStart = new Date(now.getTime() - windowMs)
  const retentionStart = new Date(now.getTime() - RETENTION_MS)
  const D = dh()

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
    recent: recentRows.map((r: any) => ({ layoutId: r.layoutId, ruleId: r.ruleId, shownAt: r.shownAt })),
    seenLayouts: new Set(seenRows.map((r: any) => r.layoutId)),
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
  const D = dh()
  const isSqlite = getDatabaseMode() === 'sqlite'
  if (isSqlite) {
    db.transaction((tx: any) => {
      tx.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff))).run()
      tx.insert(D).values({
        frameId,
        decisionId: decision.id,
        layoutId: decision.layoutId,
        ruleId: decision.ruleId,
        shownAt: shownAtMinute,
        score: decision.score,
      }).onConflictDoNothing({
        target: [D.frameId, D.decisionId, D.shownAt],
      }).run()
    })
  } else {
    await db.transaction(async (tx: any) => {
      await tx.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff)))
      await tx.insert(D).values({
        frameId,
        decisionId: decision.id,
        layoutId: decision.layoutId,
        ruleId: decision.ruleId,
        shownAt: shownAtMinute,
        score: decision.score,
      }).onConflictDoNothing({
        target: [D.frameId, D.decisionId, D.shownAt],
      })
    })
  }
}

export async function pruneHistory(frameId: string): Promise<void> {
  const db = getDb()
  const cutoff = retentionCutoff(new Date(), RETENTION_MS)
  const D = dh()
  await db.delete(D).where(and(eq(D.frameId, frameId), lt(D.shownAt, cutoff)))
}
