import { describe, expect, it } from 'vitest'
import {
  CANVAS_PROBLEM_LABELS,
  STATUS_POLL_MS,
  canvasProblems,
  type CanvasStatusRow,
} from '@/lib/canvas/problems'

const now = 100_000

const base: CanvasStatusRow = {
  canvasId: 'wall-1',
  canvasName: 'Entrance wall',
  slotId: 'slot-a',
  marker: 1,
  frameId: 'frame-a',
  frameName: 'Frame A',
  frameExists: true,
  reportedAtMs: 100_000,
  revision: 2,
  deploymentRevision: 2,
  reportedRevision: 2,
  effectiveAtMs: 90_000,
  clockOffsetMs: 8,
  clockUncertaintyMs: 6,
  clockQuality: 'good',
  viewportW: 1080,
  viewportH: 1920,
  fpsAvg: 29.5,
  unpublishedChanges: false,
}

function row(overrides: Partial<CanvasStatusRow> = {}): CanvasStatusRow {
  return { ...base, ...overrides }
}

describe('canvas problem labels', () => {
  it('exports every label used by the status table', () => {
    expect(CANVAS_PROBLEM_LABELS).toEqual([
      'Frame missing',
      'No report yet',
      'Offline',
      'Out of date',
      'Clock drift risk',
      'Wrong aspect ratio',
      'Unpublished changes',
    ])
    expect(STATUS_POLL_MS).toBe(5000)
  })

  it('returns no labels for a healthy member', () => {
    expect(canvasProblems(row(), now, STATUS_POLL_MS)).toEqual([])
  })

  it('flags a revoked frame', () => {
    expect(canvasProblems(row({ frameExists: false }), now, STATUS_POLL_MS)).toEqual(['Frame missing'])
  })

  it('flags a member that never reported', () => {
    expect(canvasProblems(row({ reportedAtMs: null, reportedRevision: null }), now, STATUS_POLL_MS)).toEqual(['No report yet'])
  })

  it('flags a member after three poll intervals without a report', () => {
    expect(canvasProblems(row({ reportedAtMs: 84_999 }), now, STATUS_POLL_MS)).toEqual(['Offline'])
  })

  it('does not flag a member at exactly three poll intervals', () => {
    expect(canvasProblems(row({ reportedAtMs: 85_000 }), now, STATUS_POLL_MS)).toEqual([])
  })

  it('does not flag a behind revision before effectiveAt', () => {
    const value = row({ effectiveAtMs: 100_001, reportedRevision: 1 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual([])
  })

  it('flags a behind revision after effectiveAt', () => {
    const value = row({ effectiveAtMs: 100_000, reportedRevision: 1 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual(['Out of date'])
  })

  it('does not flag a frame whose delivered row revision is current', () => {
    const value = row({ revision: 1, deploymentRevision: 5, reportedRevision: 1, effectiveAtMs: 100_000 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual([])
  })

  it('flags a behind row even when the deployment revision is lower', () => {
    const value = row({ revision: 5, deploymentRevision: 2, reportedRevision: 3, effectiveAtMs: 100_000 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toContain('Out of date')
  })

  it('flags poor clock quality', () => {
    const value = row({ clockQuality: 'poor' })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual(['Clock drift risk'])
  })

  it('uses a 50 ms uncertainty boundary', () => {
    expect(canvasProblems(row({ clockUncertaintyMs: 50 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ clockUncertaintyMs: 50.1 }), now, STATUS_POLL_MS)).toEqual(['Clock drift risk'])
  })

  it('flags a viewport more than one percent off 9:16', () => {
    expect(canvasProblems(row({ viewportH: 1920 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ viewportH: 1930 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ viewportH: 1950 }), now, STATUS_POLL_MS)).toEqual(['Wrong aspect ratio'])
  })

  it('flags library edits that are not deployed', () => {
    expect(canvasProblems(row({ unpublishedChanges: true }), now, STATUS_POLL_MS)).toEqual(['Unpublished changes'])
  })

  it('returns labels in a stable order for several faults', () => {
    const value = row({
      frameExists: false,
      reportedAtMs: null,
      reportedRevision: null,
      clockQuality: 'poor',
      viewportH: 1950,
      unpublishedChanges: true,
    })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual([
      'Frame missing',
      'No report yet',
      'Clock drift risk',
      'Wrong aspect ratio',
      'Unpublished changes',
    ])
  })
})
