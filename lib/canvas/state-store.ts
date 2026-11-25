import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import type { CanvasState } from '@/lib/types'

export type CanvasStateRow = {
  instanceId: string
  revision: number
  data: CanvasState
  updatedAt: Date
  reportedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
  reportedAt: Date | null
}

export type MemberReport = {
  appliedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

const EMPTY_STATE: CanvasState = { v: 1, active: null, pending: null, identify: null }
const REPORT_THROTTLE_MS = 10_000

function table() {
  return getTables().canvasState
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  return null
}

function toRow(row: Record<string, unknown>): CanvasStateRow {
  return {
    instanceId: row.instanceId as string,
    revision: Number(row.revision ?? 0),
    data: row.data as CanvasState,
    updatedAt: toDate(row.updatedAt) ?? new Date(0),
    reportedRevision: (row.reportedRevision as number | null) ?? null,
    clockOffsetMs: (row.clockOffsetMs as number | null) ?? null,
    clockUncertaintyMs: (row.clockUncertaintyMs as number | null) ?? null,
    viewportW: (row.viewportW as number | null) ?? null,
    viewportH: (row.viewportH as number | null) ?? null,
    fpsAvg: (row.fpsAvg as number | null) ?? null,
    reportedAt: toDate(row.reportedAt),
  }
}

export async function getCanvasState(instanceId: string): Promise<CanvasStateRow | null> {
  const db = getDb()
  const rows = await db.select().from(table()).where(eq(table().instanceId, instanceId)).limit(1)
  return rows[0] ? toRow(rows[0] as Record<string, unknown>) : null
}

export async function listCanvasStates(): Promise<CanvasStateRow[]> {
  const db = getDb()
  const rows = await db.select().from(table())
  return rows.map((row) => toRow(row as Record<string, unknown>))
}

export async function putCanvasState(instanceId: string, data: CanvasState): Promise<number> {
  const db = getDb()
  const existing = await getCanvasState(instanceId)
  const revision = (existing?.revision ?? 0) + 1
  const now = new Date()
  await db
    .insert(table())
    .values({ instanceId, revision, data, updatedAt: now })
    .onConflictDoUpdate({ target: table().instanceId, set: { revision, data, updatedAt: now } })
  return revision
}

/** Apply a console revision verbatim. revision 0 + null state clears the row. */
export async function applyRemoteCanvasState(instanceId: string, revision: number, data: CanvasState | null): Promise<number> {
  if (revision <= 0 || data === null) {
    await deleteCanvasState(instanceId)
    return 0
  }
  const db = getDb()
  const now = new Date()
  await db
    .insert(table())
    .values({ instanceId, revision, data, updatedAt: now })
    .onConflictDoUpdate({ target: table().instanceId, set: { revision, data, updatedAt: now } })
  return revision
}

export async function deleteCanvasState(instanceId: string): Promise<void> {
  const db = getDb()
  await db.delete(table()).where(eq(table().instanceId, instanceId))
}

function clampNumber(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

/**
 * Record what a display reported. Console-only in practice; the caller guards
 * the database mode. Throttled per instance so a 5 s poll cannot become a write
 * every 5 s. A missing row is left missing: a report alone must not create
 * canvas state for an instance that has never been deployed.
 */
export async function recordCanvasReport(instanceId: string, report: MemberReport, nowMs = Date.now()): Promise<void> {
  const existing = await getCanvasState(instanceId)
  if (!existing) return
  if (existing.reportedAt && nowMs - existing.reportedAt.getTime() < REPORT_THROTTLE_MS) return

  const db = getDb()
  const applied = report.appliedRevision === null ? null : Math.max(0, Math.floor(report.appliedRevision))
  await db
    .update(table())
    .set({
      reportedRevision: applied,
      clockOffsetMs: clampNumber(report.clockOffsetMs, -60_000, 60_000),
      clockUncertaintyMs: clampNumber(report.clockUncertaintyMs, 0, 60_000),
      viewportW: report.viewportW === null ? null : Math.round(clampNumber(report.viewportW, 1, 100_000) ?? 1),
      viewportH: report.viewportH === null ? null : Math.round(clampNumber(report.viewportH, 1, 100_000) ?? 1),
      fpsAvg: clampNumber(report.fpsAvg, 0, 240),
      reportedAt: new Date(nowMs),
    })
    .where(eq(table().instanceId, instanceId))
}

/**
 * Drop rows whose deployment has fully expired and has nothing pending.
 * Deterministic and allocation-light: rows are read once, filtered in JS, then
 * deleted one by one (no SQL max/min, which the dialect note warns about).
 */
export async function pruneCanvasState(nowMs = Date.now()): Promise<number> {
  const rows = await listCanvasStates()
  const expired = rows.filter((row) => {
    const { active, pending } = row.data ?? EMPTY_STATE
    if (pending) return false
    if (row.data?.identify && row.data.identify.until > nowMs) return false
    if (!active) return true
    if (active.releaseAt === null) return false
    return active.releaseAt <= nowMs
  })
  for (const row of expired) await deleteCanvasState(row.instanceId)
  return expired.length
}
