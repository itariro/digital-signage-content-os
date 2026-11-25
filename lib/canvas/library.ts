import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { readStore } from '@/lib/store'
import { DEFAULT_SCHEDULE } from '@/lib/schedule'
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
