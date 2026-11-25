import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { canvasConfigSchema, canvasSceneSchema } from '@/lib/canvas/schema'
import { defaultScene } from '@/lib/canvas/scenes/registry'

const slot = { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }

describe('phase 4 canvas schemas', () => {
  it('accepts bezel mode, physical units, screen size and slot rotation', () => {
    const parsed = canvasConfigSchema.safeParse({
      arrangement: 'row',
      gap: 18,
      slots: [{ ...slot, rotation: 90 }],
      bezelMode: 'collapse',
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects physical units without screen dimensions', () => {
    const parsed = canvasConfigSchema.safeParse({
      arrangement: 'row',
      slots: [slot],
      unitMode: 'physical',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts every catalog scene type', () => {
    for (const type of CATALOG_TYPES) {
      const parsed = canvasSceneSchema.safeParse({
        id: 'scene',
        name: 'Scene',
        enabled: true,
        durationSec: 30,
        seed: 1,
        type,
        config: { text: 'wall', images: [`canvas-asset:${'a'.repeat(64)}`] },
      })
      expect(parsed.success, type).toBe(true)
    }
  })

  it('still accepts the four phase 1 scene types', () => {
    const geometry = { width: 1920, height: 1080, slots: [], gaps: [] }
    for (const type of ['marquee', 'bounce', 'pong', 'sync-test'] as const) {
      const scene = defaultScene(type, geometry as never)
      expect(canvasSceneSchema.safeParse(scene).success, type).toBe(true)
    }
  })

  it('rejects media URLs in catalog image configs', () => {
    const parsed = canvasSceneSchema.safeParse({
      id: 'scene',
      name: 'Scene',
      enabled: true,
      durationSec: 30,
      seed: 1,
      type: 'gallery-wall',
      config: { images: ['/api/media/a.png'] },
    })
    expect(parsed.success).toBe(false)
  })
})
