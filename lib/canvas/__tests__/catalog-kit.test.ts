import { describe, expect, it } from 'vitest'
import type { CatalogContext } from '@/lib/canvas/catalog-kit'
import { CATALOG_TYPES, catalogConfigSchema, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

describe('catalog kit', () => {
  it('lists exactly the 28 addendum scene names', () => {
    expect(CATALOG_TYPES).toHaveLength(28)
    expect(CATALOG_TYPES[0]).toBe('panorama')
    expect(CATALOG_TYPES[27]).toBe('calibration')
    expect(new Set(CATALOG_TYPES).size).toBe(28)
  })

  it('accepts only canvas asset refs for images', () => {
    const ref = `canvas-asset:${'a'.repeat(64)}`
    expect(catalogConfigSchema.safeParse({ images: [ref] }).success).toBe(true)
    expect(catalogConfigSchema.safeParse({ images: ['/api/media/a.png'] }).success).toBe(false)
  })

  it('clamps numbers and builds bounded deterministic cells', () => {
    expect(configNumber({ speed: 9999 }, 'speed', 100, 0, 4000)).toBe(4000)
    expect(configNumber({}, 'speed', 100, 0, 4000)).toBe(100)
    const ctx = {
      bounds: { width: 1000, height: 500 },
      geometry: { width: 1000, height: 500, slots: [], gaps: [] },
      tMs: 0,
      seed: 4,
    }
    expect(gridCells(ctx as unknown as CatalogContext, 40, 40, 0).length).toBeLessThanOrEqual(32)
    expect(wave01(7, 500, 0)).toBe(wave01(7, 500, 0))
  })
})
