import { describe, expect, it } from 'vitest'
import type { CanvasTemplateId } from '@/lib/types'
import { albumUpdateSchema, layoutInputSchema } from '@/lib/schema'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { CANVAS_TEMPLATES, templateDocuments } from '@/lib/canvas/templates'

const expected: { id: CanvasTemplateId; name: string; palette: string; transition: string }[] = [
  { id: 'hello-wall', name: 'Hello Wall', palette: 'candy', transition: 'wipe' },
  { id: 'sync-check', name: 'Sync Check', palette: 'mono', transition: 'chase' },
  { id: 'colour-study', name: 'Colour Study', palette: 'aurora', transition: 'iris' },
  { id: 'type-parade', name: 'Type Parade', palette: 'neon', transition: 'wipe' },
  { id: 'arcade-night', name: 'Arcade Night', palette: 'sunset', transition: 'chase' },
  { id: 'wall-clock', name: 'Wall Clock', palette: 'mono', transition: 'wipe' },
]

describe('canvas templates', () => {
  it('defines exactly the six starter shows', () => {
    expect(CANVAS_TEMPLATES.map((template) => template.id)).toEqual(expected.map((item) => item.id))
    expect(CANVAS_TEMPLATES.map((template) => template.name)).toEqual(expected.map((item) => item.name))
  })

  it('gives each show its declared palette and transition', () => {
    for (const item of expected) {
      const template = templateDocuments(item.id)
      expect(template.album.paletteId).toBe(item.palette)
      expect(template.album.transition!.kind).toBe(item.transition)
    }
  })

  it('produces valid layout and album documents', () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(layoutInputSchema.safeParse(template.layout).success).toBe(true)
      expect(albumUpdateSchema.safeParse(template.album).success).toBe(true)
    }
  })

  it('paints catalog scenes with palette tokens', () => {
    let painted = 0
    for (const template of CANVAS_TEMPLATES) {
      for (const scene of template.album.scenes) {
        if (!(CATALOG_TYPES as readonly string[]).includes(scene.type)) continue
        const colors = (scene.config as { colors?: string[] }).colors
        expect(Array.isArray(colors)).toBe(true)
        expect(colors?.length).toBeGreaterThan(0)
        expect(colors?.every((color) => color.startsWith('palette:'))).toBe(true)
        painted += 1
      }
    }
    expect(painted).toBeGreaterThan(0)
  })

  it('needs no uploads or network assets', () => {
    for (const template of CANVAS_TEMPLATES) {
      const json = JSON.stringify(template)
      expect(json).not.toContain('/api/media')
      expect(json).not.toContain('/api/uploads')
      expect(json).not.toContain('data:image')
      expect(json).not.toContain('http://')
      expect(json).not.toContain('https://')
    }
  })

  it('uses unassigned slots, unique scene ids and one mirrored layer', () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(template.layout.canvas.slots.length).toBeGreaterThan(0)
      for (const slot of template.layout.canvas.slots) expect(slot.frameId).toBeNull()
      const scenes = template.album.scenes
      expect(scenes.length).toBeGreaterThan(0)
      expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length)
      for (const scene of scenes) {
        expect(scene.enabled).toBe(true)
        expect(scene.durationSec).toBeGreaterThanOrEqual(5)
        expect(Number.isInteger(scene.seed)).toBe(true)
      }
      expect(template.album.layers).toHaveLength(1)
      expect(template.album.layers![0].scenes).toEqual(scenes)
    }
  })

  it('builds the same documents on every call', () => {
    for (const item of expected) {
      expect(templateDocuments(item.id)).toEqual(templateDocuments(item.id))
    }
  })
})
