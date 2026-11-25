import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { SCENE_FIELDS } from '@/lib/canvas/scenes/fields'
import { computeSceneState, defaultScene, SCENE_META } from '@/lib/canvas/scenes/registry'
import type { CanvasConfig } from '@/lib/types'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}
const geometry = resolveGeometry(config)
const ctx = {
  bounds: { width: geometry.width, height: geometry.height },
  geometry,
  tMs: 1234,
  seed: 5,
}

describe('catalog registry', () => {
  it('has metadata, defaults and state for all 28 catalog scenes', () => {
    for (const type of CATALOG_TYPES) {
      expect(SCENE_META[type], type).toBeDefined()
      expect(SCENE_FIELDS[type], type).toBeDefined()
      expect(SCENE_FIELDS[type].some((field) => field.key === 'images'), type).toBe(true)
      const scene = defaultScene(type, geometry)
      expect(scene.type).toBe(type)
      const state = computeSceneState(scene, ctx)
      expect(state.type).toBe(type)
      expect(computeSceneState(scene, ctx)).toEqual(state)
    }
  })

  it('keeps the phase 1 sync-test scene intact', () => {
    const scene = defaultScene('sync-test', geometry)
    expect(scene.type).toBe('sync-test')
    expect(computeSceneState(scene, ctx).type).toBe('sync-test')
  })
})
