import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { exhibitState } from '@/lib/canvas/scenes/catalog/exhibit'
import { galleryWallState } from '@/lib/canvas/scenes/catalog/gallery-wall'
import { mosaicWallState } from '@/lib/canvas/scenes/catalog/mosaic-wall'
import { panoramaState } from '@/lib/canvas/scenes/catalog/panorama'
import { tileRevealState } from '@/lib/canvas/scenes/catalog/tile-reveal'

const ctx: CatalogContext = {
  bounds: { width: 4000, height: 1200 },
  geometry: { width: 4000, height: 1200 },
  tMs: 12_340,
  seed: 9,
}
const config: CatalogSceneConfig = {
  images: Array.from({ length: 6 }, () => `canvas-asset:${'a'.repeat(64)}`),
  lines: ['A', 'B'],
  text: 'WALL',
  periodSec: 4,
}
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['panorama', panoramaState],
  ['gallery-wall', galleryWallState],
  ['exhibit', exhibitState],
  ['mosaic-wall', mosaicWallState],
  ['tile-reveal', tileRevealState],
]

describe('gallery catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('reuses the shared mosaic and reveal engines', () => {
    const root = process.cwd()
    const mosaic = readFileSync(path.join(root, 'lib/canvas/scenes/catalog/mosaic-wall.ts'), 'utf8')
    expect(mosaic).toContain("from '@/lib/mosaic'")
    expect(mosaic).toContain('mosaicAt(')
    const reveal = readFileSync(path.join(root, 'lib/canvas/scenes/catalog/tile-reveal.ts'), 'utf8')
    expect(reveal).toContain("from '@/lib/reveal'")
    expect(reveal).toContain('revealAt(')
  })
})
