import { describe, expect, it } from 'vitest'
import type { CanvasScene } from '@/lib/types'
import {
  CANVAS_PALETTES,
  DEFAULT_CANVAS_PALETTE,
  getCanvasPalette,
  isCanvasPaletteId,
  resolveSceneColors,
} from '@/lib/canvas/palettes'

const marquee = (): CanvasScene => ({
  id: 'm1',
  name: 'Marquee',
  enabled: true,
  durationSec: 60,
  seed: 1,
  type: 'marquee',
  config: {
    lines: ['palette:text is a colour token, not a line to replace'],
    layout: 'line',
    separator: '   •   ',
    direction: 'left',
    orientation: 'upright',
    speed: 240,
    repeat: true,
    gap: 600,
    lineHeight: 200,
    fontSize: 160,
    align: 'center',
    crossOffset: 0,
    style: {
      fontFamily: 'bebas',
      fontWeight: 700,
      letterSpacing: 0,
      align: 'center',
      color: 'palette:text',
      accent: 'palette:accent',
      bg: '#000000',
      bgOpacity: 0,
      blur: 0,
      radius: 0,
      stroke: '#ffffff',
      strokeWidth: 0,
      textStroke: 0,
      opacity: 100,
      shadow: false,
    },
  },
})

describe('built-in canvas palettes', () => {
  it('defines six upload-free palettes with five hex colours each', () => {
    expect(CANVAS_PALETTES).toHaveLength(6)
    expect(new Set(CANVAS_PALETTES.map((palette) => palette.id)).size).toBe(6)
    for (const palette of CANVAS_PALETTES) {
      expect(Object.keys(palette.colors).sort()).toEqual(['accent', 'background', 'primary', 'secondary', 'text'])
      for (const color of Object.values(palette.colors)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
    expect(JSON.stringify(CANVAS_PALETTES)).not.toContain('/api/')
    expect(JSON.stringify(CANVAS_PALETTES)).not.toContain('data:image')
  })

  it('falls back to the neutral palette for unknown or missing ids', () => {
    expect(getCanvasPalette(undefined).id).toBe(DEFAULT_CANVAS_PALETTE.id)
    expect(getCanvasPalette('aurora').id).toBe('aurora')
    expect(isCanvasPaletteId('aurora')).toBe(true)
    expect(isCanvasPaletteId('missing')).toBe(false)
  })
})

describe('resolveSceneColors', () => {
  it('replaces exact palette tokens in nested scene config fields', () => {
    const palette = getCanvasPalette('neon')
    const scene = marquee()
    const resolved = resolveSceneColors(scene, palette)
    expect(resolved.type).toBe('marquee')
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    if (scene.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe(palette.colors.text)
    expect(resolved.config.style.accent).toBe(palette.colors.accent)
    expect(resolved.config.lines).toEqual(scene.config.lines)
  })

  it('does not mutate its input', () => {
    const scene = marquee()
    const before = JSON.stringify(scene)
    resolveSceneColors(scene, getCanvasPalette('candy'))
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('uses the default palette when none is supplied', () => {
    const resolved = resolveSceneColors(marquee())
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe(DEFAULT_CANVAS_PALETTE.colors.text)
  })

  it('leaves unknown tokens and non-token strings alone', () => {
    const scene = marquee()
    if (scene.type !== 'marquee') throw new Error('wrong scene')
    scene.config.style.color = 'palette:unknown'
    scene.config.style.accent = '#123456'
    const resolved = resolveSceneColors(scene, getCanvasPalette('mono'))
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe('palette:unknown')
    expect(resolved.config.style.accent).toBe('#123456')
  })
})
