import { describe, expect, it } from 'vitest'
import { resolveGeometry } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'
import { syncTestState } from '@/lib/canvas/scenes/sync-test'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const geometry = resolveGeometry(config)
const bounds = { width: geometry.width, height: geometry.height }

describe('syncTestState', () => {
  it('sweeps a bar across the wider axis and returns', () => {
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 0, seed: 1 })).toEqual({ axis: 'x', bar: 0 })
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 2_000, seed: 1 }).bar).toBe(bounds.width)
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 4_000, seed: 1 }).bar).toBe(0)
  })

  it('uses the taller axis for a column canvas', () => {
    const column = resolveGeometry({ ...config, arrangement: 'column' })
    const state = syncTestState(
      { periodSec: 4, showGrid: true, showBezels: true },
      { bounds: { width: column.width, height: column.height }, geometry: column, tMs: 1_000, seed: 1 },
    )
    expect(state.axis).toBe('y')
    expect(state.bar).toBeGreaterThan(0)
  })
})
