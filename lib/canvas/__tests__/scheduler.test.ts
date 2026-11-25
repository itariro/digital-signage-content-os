import { describe, expect, it } from 'vitest'
import type { CanvasScene, DeploymentAlbum } from '@/lib/types'
import { sceneAt } from '@/lib/canvas/scheduler'

function scene(id: string, seconds: number, enabled = true): CanvasScene {
  return { id, name: id, enabled, durationSec: seconds, seed: 7, type: 'sync-test', config: { periodSec: 4, showGrid: true, showBezels: true } }
}

function album(scenes: CanvasScene[], order: 'sequence' | 'shuffle' = 'sequence'): DeploymentAlbum {
  return { id: 'alb', name: 'Album', scenes, order, crossfadeMs: 1000 }
}

const three = album([scene('a', 10), scene('b', 10), scene('c', 10)])

describe('sceneAt', () => {
  it('walks scenes in sequence order', () => {
    expect(sceneAt(three, 1, 0, 1000)?.scene.id).toBe('a')
    expect(sceneAt(three, 1, 9_999, 1000)?.scene.id).toBe('a')
    expect(sceneAt(three, 1, 10_000, 1000)?.scene.id).toBe('b')
    expect(sceneAt(three, 1, 20_000, 1000)?.scene.id).toBe('c')
    expect(sceneAt(three, 1, 30_000, 1000)?.scene.id).toBe('a')
  })

  it('reports scene-local time, cycle and the next change', () => {
    const plan = sceneAt(three, 1, 15_000, 1000)!
    expect(plan.sceneTimeMs).toBe(5_000)
    expect(plan.cycle).toBe(0)
    expect(plan.nextChangeAtMs).toBe(20_000)
    expect(plan.index).toBe(1)
  })

  it('returns null before the origin, for empty albums and for all-disabled albums', () => {
    expect(sceneAt(three, 1, -1, 1000)).toBeNull()
    expect(sceneAt(album([]), 1, 0, 1000)).toBeNull()
    expect(sceneAt(album([scene('a', 10, false)]), 1, 0, 1000)).toBeNull()
  })

  it('ramps opacity at both scene edges', () => {
    expect(sceneAt(three, 1, 0, 1000)?.fade).toBe(0)
    expect(sceneAt(three, 1, 500, 1000)?.fade).toBeCloseTo(0.5, 5)
    expect(sceneAt(three, 1, 5_000, 1000)?.fade).toBe(1)
    expect(sceneAt(three, 1, 9_500, 1000)?.fade).toBeCloseTo(0.5, 5)
    expect(sceneAt(three, 1, 9_999, 1000)?.fade).toBeCloseTo(0.001, 2)
  })

  it('caps the fade window at a third of very short scenes', () => {
    const short = album([scene('a', 5), scene('b', 5)])
    expect(sceneAt(short, 1, 1_000, 3_000)?.fade).toBeCloseTo(0.6, 5)
  })

  it('shuffle uses each scene exactly once per cycle and keeps the cycle length', () => {
    const shuffled = album([scene('a', 10), scene('b', 20), scene('c', 30)], 'shuffle')
    const first = sceneAt(shuffled, 42, 0, 0)!
    const atEnd = sceneAt(shuffled, 42, 60_000, 0)!
    expect(atEnd.cycle).toBe(1)
    expect(atEnd.sceneTimeMs).toBe(0)
    expect(sceneAt(shuffled, 42, 30_000, 0)?.cycle).toBe(0)
    const seen = new Set<string>()
    for (let t = 0; t < 60_000; t += 100) seen.add(sceneAt(shuffled, 42, t, 0)!.scene.id)
    expect([...seen].sort()).toEqual(['a', 'b', 'c'])
    expect(first.cycle).toBe(0)
  })

  it('stays finite for a week of playback', () => {
    const plan = sceneAt(three, 1, 7 * 24 * 60 * 60 * 1000, 1000)!
    expect(Number.isFinite(plan.sceneTimeMs)).toBe(true)
    expect(Number.isFinite(plan.nextChangeAtMs)).toBe(true)
    expect(Number.isFinite(plan.fade)).toBe(true)
  })
})
