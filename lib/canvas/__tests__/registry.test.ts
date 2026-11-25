import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasSceneType } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { SCENE_META, coerceScene, computeSceneState, defaultScene, sceneStateAt } from '@/lib/canvas/scenes/registry'

const config: CanvasConfig = {
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
}
const geometry = resolveGeometry(config)
const types: CanvasSceneType[] = ['marquee', 'bounce', 'pong', 'sync-test']

describe('SCENE_META', () => {
  it('describes every scene type', () => {
    for (const type of types) {
      expect(SCENE_META[type].label.length).toBeGreaterThan(0)
      expect(SCENE_META[type].description.length).toBeGreaterThan(0)
      expect(SCENE_META[type].icon).toBeDefined()
    }
  })
})

describe('defaultScene', () => {
  it('creates a valid scene for every type with a unique id', () => {
    const ids = new Set<string>()
    for (const type of types) {
      const scene = defaultScene(type, geometry)
      expect(scene.type).toBe(type)
      expect(scene.id.length).toBeGreaterThan(0)
      expect(canvasSceneSchema.safeParse(scene).success).toBe(true)
      ids.add(scene.id)
    }
    expect(ids.size).toBe(types.length)
  })
})

describe('coerceScene', () => {
  it('coerces an invalid marquee direction and fills the strip', () => {
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const up = { ...base, config: { ...base.config, direction: 'up' as const, strip: undefined } }
    const coerced = coerceScene(up, 'row', geometry)
    if (coerced.type !== 'marquee') throw new Error('wrong scene')
    expect(coerced.config.direction).toBe('left')
    expect(coerced.config.strip?.lengthPx).toBeGreaterThan(0)
    expect(canvasSceneSchema.safeParse(coerced).success).toBe(true)
  })

  it('drops a strip measured for the previous travel axis', () => {
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const horizontal = {
      ...base,
      config: {
        ...base.config,
        layout: 'block' as const,
        lines: ['a', 'b', 'c'],
        lineHeight: 100,
        direction: 'right' as const,
        strip: { lengthPx: 300, crossPx: geometry.height, segments: [] },
      },
    }
    const coerced = coerceScene(horizontal, 'column', geometry)
    if (coerced.type !== 'marquee') throw new Error('wrong scene')
    expect(coerced.config.direction).toBe('up')
    expect(coerced.config.strip?.crossPx).toBe(geometry.width)
    expect(coerced.config.strip?.lengthPx).toBe(300)
  })

  it('leaves a valid direction alone', () => {
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const right = { ...base, config: { ...base.config, direction: 'right' as const } }
    const coerced = coerceScene(right, 'row', geometry)
    if (coerced.type !== 'marquee') throw new Error('wrong scene')
    expect(coerced.config.direction).toBe('right')
  })
})

describe('computeSceneState', () => {
  it('dispatches by scene type and narrows the state', () => {
    const marquee = computeSceneState(defaultScene('marquee', geometry), { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(marquee.type).toBe('marquee')
    if (marquee.type === 'marquee') expect(marquee.state.axis).toBe('x')

    const pong = computeSceneState(defaultScene('pong', geometry), { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(pong.type).toBe('pong')
    if (pong.type === 'pong') expect(pong.state.phase).toBe('serve')
  })

  it('keeps the config on the result', () => {
    const scene = defaultScene('sync-test', geometry)
    const result = computeSceneState(scene, { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(result.config).toEqual(scene.config)
  })
})

describe('sceneStateAt', () => {
  it('is the public alias for computeSceneState', () => {
    const scene = defaultScene('pong', geometry)
    const ctx = { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1, slot: geometry.slots[0] }
    expect(sceneStateAt(scene, ctx)).toEqual(computeSceneState(scene, ctx))
  })
})
