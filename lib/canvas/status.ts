import { listInstanceCards } from '@/lib/console/service'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { canvasContentHash, deployedCanvasContentHash } from '@/lib/canvas/hash'
import type { CanvasClockQuality, CanvasStatusRow } from '@/lib/canvas/problems'
import { CANVAS_LIBRARY_ID, ensureCanvasLibrary } from '@/lib/canvas/library'
import { listCanvasStates, pruneCanvasState } from '@/lib/canvas/state-store'
import type { CanvasStateRow } from '@/lib/canvas/state-store'
import { readStore } from '@/lib/store'
import type { CanvasDeployment } from '@/lib/types'

export type CanvasStatus = CanvasStatusRow

export type CanvasStatusState = 'draft' | 'scheduled' | 'live' | 'released'

export type CanvasStatusRowWithState = CanvasStatusRow & { state: CanvasStatusState }

const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/

function clockQualityFromUncertainty(
  clockOffsetMs: number | null,
  clockUncertaintyMs: number | null,
): CanvasClockQuality | null {
  if (clockOffsetMs === null || clockUncertaintyMs === null) return null
  if (clockUncertaintyMs <= 15) return 'good'
  if (clockUncertaintyMs <= 50) return 'fair'
  return 'poor'
}

function deploymentState(deployment: CanvasDeployment | null, nowMs: number): CanvasStatusState {
  if (!deployment) return 'draft'
  if (nowMs < deployment.effectiveAt) return 'scheduled'
  if (deployment.releaseAt !== null && nowMs >= deployment.releaseAt) return 'released'
  return 'live'
}

function toEpochMs(value: Date | string | number | null): number | null {
  if (value === null) return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The deployed snapshot lives on the members that received it. A draft slot can
 * point at a replacement frame with no state row, so read the snapshot from the
 * canvas's delivery rows rather than from the draft assignment.
 */
function deployedSnapshot(rows: CanvasStateRow[], layoutId: string): CanvasDeployment | null {
  let newest: CanvasDeployment | null = null
  for (const row of rows) {
    for (const candidate of [row.data.pending, row.data.active]) {
      if (!candidate || candidate.canvasId !== layoutId) continue
      if (!newest || candidate.revision > newest.revision) newest = candidate
    }
  }
  return newest
}

export async function getCanvasStatus(
  input: { layoutId?: string } = {},
): Promise<CanvasStatusRowWithState[]> {
  const layoutFilter = input.layoutId?.trim()
  if (layoutFilter && !VALID_ID.test(layoutFilter)) return []

  await ensureCanvasLibrary()
  const store = await readStore(CANVAS_LIBRARY_ID)
  if (!store) return []

  const nowMs = Date.now()
  await pruneCanvasState(nowMs)

  const layouts = store.layouts.filter((layout) =>
    layout.kind === 'canvas' &&
    layout.canvas !== undefined &&
    (!layoutFilter || layout.id === layoutFilter),
  )
  if (layouts.length === 0) return []

  const stateRows = await listCanvasStates()
  const cards = await listInstanceCards()
  const cardsById = new Map(cards.map((card) => [card.id, card]))

  const statuses: CanvasStatusRowWithState[] = []

  for (const layout of layouts) {
    if (!layout.canvas) continue
    const geometry = resolveGeometry(layout.canvas)
    const markers = new Map(geometry.slots.map((slot) => [slot.slotId, slot.marker]))
    const canvasRows = stateRows.filter((row) =>
      row.data.active?.canvasId === layout.id || row.data.pending?.canvasId === layout.id,
    )
    if (canvasRows.length === 0) continue
    const rowsByInstance = new Map(canvasRows.map((row) => [row.instanceId, row]))
    const snapshot = deployedSnapshot(canvasRows, layout.id)
    const deployedHash = snapshot ? deployedCanvasContentHash(snapshot) : null
    const album = layout.settings.albumId
      ? store.albums.find((value) => value.id === layout.settings.albumId && value.theme === 'canvas') ?? null
      : null
    const libraryHash = canvasContentHash(layout, album)

    for (const slot of layout.canvas.slots) {
      const frameId = slot.frameId ?? ''
      const stateRow = frameId ? rowsByInstance.get(frameId) ?? null : null
      const card = frameId ? cardsById.get(frameId) ?? null : null
      const deployment = stateRow?.data.pending ?? stateRow?.data.active ?? null
      const deploymentRevision = deployment?.revision ?? null
      const rowRevision = stateRow?.revision ?? 0

      statuses.push({
        canvasId: layout.id,
        canvasName: layout.name,
        slotId: slot.id,
        marker: markers.get(slot.id) ?? geometry.slots.find((value) => value.slotId === slot.id)?.marker ?? 0,
        frameId,
        frameName: card?.frame?.name ?? (frameId || null),
        frameExists: Boolean(card),
        reportedAtMs: toEpochMs(stateRow?.reportedAt ?? null),
        revision: rowRevision,
        deploymentRevision,
        reportedRevision: stateRow?.reportedRevision ?? null,
        effectiveAtMs: deployment?.effectiveAt ?? null,
        clockOffsetMs: stateRow?.clockOffsetMs ?? null,
        clockUncertaintyMs: stateRow?.clockUncertaintyMs ?? null,
        clockQuality: clockQualityFromUncertainty(
          stateRow?.clockOffsetMs ?? null,
          stateRow?.clockUncertaintyMs ?? null,
        ),
        viewportW: stateRow?.viewportW ?? null,
        viewportH: stateRow?.viewportH ?? null,
        fpsAvg: stateRow?.fpsAvg ?? null,
        unpublishedChanges: deployedHash !== null && deployedHash !== libraryHash,
        state: deploymentState(deployment, nowMs),
      })
    }
  }

  return statuses.sort((a, b) =>
    a.canvasId.localeCompare(b.canvasId) ||
    a.marker - b.marker ||
    a.slotId.localeCompare(b.slotId),
  )
}
