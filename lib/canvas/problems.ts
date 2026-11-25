export type CanvasClockQuality = 'good' | 'fair' | 'poor'

export type CanvasProblem =
  | 'Frame missing'
  | 'No report yet'
  | 'Offline'
  | 'Out of date'
  | 'Clock drift risk'
  | 'Wrong aspect ratio'
  | 'Unpublished changes'

export const CANVAS_PROBLEM_LABELS = [
  'Frame missing',
  'No report yet',
  'Offline',
  'Out of date',
  'Clock drift risk',
  'Wrong aspect ratio',
  'Unpublished changes',
] as const

export const STATUS_POLL_MS = 5000

export type CanvasStatusRow = {
  canvasId: string
  canvasName: string
  slotId: string
  marker: number
  frameId: string
  frameName: string | null
  frameExists: boolean
  reportedAtMs: number | null
  revision: number
  deploymentRevision: number | null
  reportedRevision: number | null
  effectiveAtMs: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  clockQuality: CanvasClockQuality | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
  unpublishedChanges: boolean
}

const TARGET_RATIO = 9 / 16
const RATIO_TOLERANCE = TARGET_RATIO * 0.01
const CLOCK_UNCERTAINTY_LIMIT_MS = 50

export function canvasProblems(row: CanvasStatusRow, nowMs: number, pollMs: number): CanvasProblem[] {
  const problems: CanvasProblem[] = []

  if (!row.frameExists) problems.push('Frame missing')

  if (row.reportedAtMs === null) {
    problems.push('No report yet')
  } else if (nowMs - row.reportedAtMs > 3 * pollMs) {
    problems.push('Offline')
  }

  const deliveredRevision = row.deploymentRevision ?? row.revision
  if (
    row.effectiveAtMs !== null &&
    nowMs >= row.effectiveAtMs &&
    row.reportedRevision !== null &&
    row.reportedRevision < deliveredRevision
  ) {
    problems.push('Out of date')
  }

  if (
    row.clockQuality === 'poor' ||
    (row.clockUncertaintyMs !== null && row.clockUncertaintyMs > CLOCK_UNCERTAINTY_LIMIT_MS)
  ) {
    problems.push('Clock drift risk')
  }

  if (row.viewportW !== null && row.viewportH !== null && row.viewportH > 0) {
    const ratio = row.viewportW / row.viewportH
    if (Math.abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE) problems.push('Wrong aspect ratio')
  }

  if (row.unpublishedChanges) problems.push('Unpublished changes')

  return problems
}
