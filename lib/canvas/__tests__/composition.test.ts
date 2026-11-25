import { describe, expect, it } from 'vitest'
import type { CanvasAlbum, CanvasLayer, CanvasScene, DeploymentAlbum } from '@/lib/types'
import { defaultSlideshow } from '@/lib/albums'
import { hash32 } from '@/lib/canvas/prng'
import { sceneAt } from '@/lib/canvas/scheduler'
import {
  BASE_LAYER_ID,
  deploymentAlbumFrom,
  layerPlanAt,
  syncCanvasAlbumLayers,
} from '@/lib/canvas/composition'

const scene = (id: string, durationSec = 10): CanvasScene => ({
  id,
  name: id,
  enabled: true,
  durationSec,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
})

const deployment = (overrides: Partial<DeploymentAlbum> = {}): DeploymentAlbum => ({
  id: 'album-1',
  name: 'Album',
  scenes: [scene('a'), scene('b')],
  order: 'sequence',
  crossfadeMs: 1000,
  ...overrides,
})

const layer = (id: string, scenes: CanvasScene[], enabled = true): CanvasLayer => ({
  id,
  name: id,
  enabled,
  scenes,
  order: 'sequence',
  crossfadeMs: 1000,
})

const album = (overrides: Partial<CanvasAlbum> = {}): CanvasAlbum => ({
  id: 'album-1',
  name: 'Album',
  theme: 'canvas',
  items: [],
  slideshow: defaultSlideshow('canvas'),
  scenes: [scene('a')],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('syncCanvasAlbumLayers', () => {
  it('keeps a phase 1 album\'s scenes as layer zero', () => {
    const old = album()
    const result = syncCanvasAlbumLayers(old)
    expect(result.scenes).toEqual(old.scenes)
    expect(result.layers).toHaveLength(1)
    expect(result.layers?.[0].id).toBe(BASE_LAYER_ID)
    expect(result.layers?.[0].scenes).toEqual(old.scenes)
    expect(result.transition).toBeUndefined()
    expect(result.paletteId).toBeUndefined()
  })

  it('clamps to three layers and mirrors layer zero back into scenes', () => {
    const layers = [layer('one', [scene('one')]), layer('two', [scene('two')]), layer('three', [scene('three')]), layer('four', [scene('four')])]
    const result = syncCanvasAlbumLayers(album({ layers, scenes: [] }))
    expect(result.layers?.map((item) => item.id)).toEqual(['one', 'two', 'three'])
    expect(result.scenes).toEqual([scene('one')])
  })

  it('sanitizes transition and palette values', () => {
    const result = syncCanvasAlbumLayers(album({
      transition: { kind: 'wipe', durationMs: 99_999, direction: 'sideways' as 'left' },
      paletteId: 'missing' as 'aurora',
    }))
    expect(result.transition).toEqual({ kind: 'wipe', durationMs: 10_000, direction: 'left' })
    expect(result.paletteId).toBeUndefined()
  })
})

describe('layerPlanAt', () => {
  it('composes a phase 1 album unchanged when layers are absent', () => {
    const item = deployment()
    expect(layerPlanAt(item, 42, 15_000)).toEqual([
      {
        layerId: BASE_LAYER_ID,
        index: 0,
        name: 'Album',
        opacity: 1,
        plan: sceneAt(item, 42, 15_000, 1000),
      },
    ])
  })

  it('composes three layers on the same timeline', () => {
    const item = deployment({
      layers: [
        layer('base', [scene('a', 10)]),
        layer('middle', [scene('m', 20)]),
        layer('top', [scene('t', 5)]),
      ],
    })
    const plans = layerPlanAt(item, 42, 3_000)
    expect(plans.map((plan) => plan.layerId)).toEqual(['base', 'middle', 'top'])
    expect(plans.map((plan) => plan.plan?.scene.id)).toEqual(['a', 'm', 't'])
    expect(plans.map((plan) => plan.plan?.sceneTimeMs)).toEqual([3_000, 3_000, 3_000])
  })

  it('skips a disabled layer', () => {
    const item = deployment({
      layers: [layer('base', [scene('a')]), layer('hidden', [scene('h')], false), layer('top', [scene('t')])],
    })
    expect(layerPlanAt(item, 42, 1_000).map((plan) => plan.layerId)).toEqual(['base', 'top'])
  })

  it('keeps fades in phase with sceneAt and never desyncs a neighbour', () => {
    const base = layer('base', [scene('a', 10)])
    const top = layer('top', [scene('t', 10)])
    const item = deployment({ layers: [base, top] })
    const plans = layerPlanAt(item, 42, 500)
    const layerSeed = (index: number) => hash32(42 ^ hash32(index + 1))
    const baseDirect = sceneAt({ id: 'album-1|base', name: 'base', scenes: base.scenes, order: 'sequence', crossfadeMs: 1000 }, layerSeed(0), 500, 1000)
    const topDirect = sceneAt({ id: 'album-1|top', name: 'top', scenes: top.scenes, order: 'sequence', crossfadeMs: 1000 }, layerSeed(1), 500, 1000)
    expect(plans[0].plan).toEqual(baseDirect)
    expect(plans[1].plan).toEqual(topDirect)
    expect(plans[0].plan?.fade).toBeCloseTo(0.5, 5)
    expect(plans[1].plan?.fade).toBeCloseTo(0.5, 5)
    expect(plans[0].plan?.sceneTimeMs).toBe(500)
    expect(plans[1].plan?.sceneTimeMs).toBe(500)

    // A skipped layer keeps its position in the layer array; it does not
    // renumber the layers after it or change their scene-local time or fade.
    const withOff = layerPlanAt(deployment({ layers: [base, layer('off', [scene('x')], false), top] }), 42, 500)
    expect(withOff.map((entry) => entry.layerId)).toEqual(['base', 'top'])
    expect(withOff.map((entry) => entry.index)).toEqual([0, 2])
    expect(withOff.map((entry) => entry.plan?.scene.id)).toEqual(['a', 't'])
    expect(withOff.map((entry) => entry.plan?.sceneTimeMs)).toEqual([500, 500])
    expect(withOff.map((entry) => entry.plan?.fade)).toEqual(plans.map((entry) => entry.plan?.fade))
  })

  it('is deterministic', () => {
    const item = deployment({ layers: [layer('a', [scene('a')]), layer('b', [scene('b')])] })
    expect(layerPlanAt(item, 42, 4_321)).toEqual(layerPlanAt(item, 42, 4_321))
  })
})

describe('deploymentAlbumFrom', () => {
  it('carries layers, transition and a resolved palette into the snapshot', () => {
    const item = album({
      layers: [layer('one', [scene('a')]), layer('two', [scene('b')])],
      transition: { kind: 'chase', durationMs: 800, direction: 'right' },
      paletteId: 'forest',
    })
    const snapshot = deploymentAlbumFrom(item)
    expect(snapshot.layers).toHaveLength(2)
    expect(snapshot.scenes).toEqual([scene('a')])
    expect(snapshot.transition).toEqual({ kind: 'chase', durationMs: 800, direction: 'right' })
    expect(snapshot.palette?.id).toBe('forest')
  })
})
