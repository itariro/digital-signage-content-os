import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { SCENE_FIELDS } from '@/lib/canvas/scenes/fields'
import type { SceneField } from '@/lib/canvas/scenes/types'

function control(fields: SceneField[], key: string): SceneField | undefined {
  return fields.find((field) => field.key === key)
}

describe('scene field controls', () => {
  it('exposes the marquee font size used by the renderer', () => {
    const field = control(SCENE_FIELDS.marquee, 'fontSize')

    expect(field, 'marquee font size control').toBeDefined()
    expect(field).toMatchObject({ kind: 'number', min: 20, max: 400, step: 10 })
  })

  it('exposes catalog controls for settings the renderer reads', () => {
    for (const type of CATALOG_TYPES) {
      const keys = SCENE_FIELDS[type].map((field) => field.key)
      expect(keys, type).toContain('angle')
      expect(keys, type).toContain('fontFamily')
      expect(keys, type).toContain('fontSize')
      expect(keys, type).toContain('opacity')
    }
  })

  it('omits catalog controls for settings no renderer reads', () => {
    for (const type of CATALOG_TYPES) {
      const keys = SCENE_FIELDS[type].map((field) => field.key)
      expect(keys, type).not.toContain('tileMs')
      expect(keys, type).not.toContain('reversed')
      expect(keys, type).not.toContain('trail')
    }
  })
})
