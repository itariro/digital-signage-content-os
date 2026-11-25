import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { readStore } from '@/lib/store'
import { DEFAULT_SCHEDULE } from '@/lib/schedule'
import { listCanvasStates, pruneCanvasState, type CanvasStateRow } from '@/lib/canvas/state-store'
import type { FrameStore } from '@/lib/types'
import { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

export { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

/** The library document is console-only. Callers return 403 when this is true. */
export function libraryOnKiosk(frameId: string | null | undefined): boolean {
  return isLibraryFrame(frameId) && Boolean(process.env.INSTANCE_ID)
}

export async function ensureCanvasLibrary(): Promise<FrameStore> {
  const existing = await readStore(CANVAS_LIBRARY_ID)
  if (existing) return existing

  const now = new Date()
  const data: FrameStore = {
    activeId: null,
    layouts: [],
    presets: [],
    customFonts: [],
    schedule: structuredClone(DEFAULT_SCHEDULE),
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
  }
  const tables = getTables()
  await getDb().insert(tables.frameDocuments).values({
    id: nanoid(12),
    identifier: CANVAS_LIBRARY_ID,
    name: 'Canvas library',
    data,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: tables.frameDocuments.identifier })
  return (await readStore(CANVAS_LIBRARY_ID)) ?? data
}

export type CanvasLayoutPhase = 'draft' | 'scheduled' | 'live' | 'released'

export function canvasLayoutPhaseFromRows(
  layoutId: string,
  rows: CanvasStateRow[],
  nowMs = Date.now(),
): CanvasLayoutPhase {
  let scheduled = false
  let live = false
  let released = false
  for (const row of rows) {
    if (row.data.pending?.canvasId === layoutId) scheduled = true
    const active = row.data.active
    if (active?.canvasId !== layoutId) continue
    if (active.releaseAt === null || active.releaseAt > nowMs) live = true
    else released = true
  }
  if (scheduled) return 'scheduled'
  if (live) return 'live'
  if (released) return 'released'
  return 'draft'
}

export async function getCanvasLayoutPhase(layoutId: string): Promise<CanvasLayoutPhase> {
  await pruneCanvasState()
  return canvasLayoutPhaseFromRows(layoutId, await listCanvasStates())
}
