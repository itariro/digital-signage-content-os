import type { CanvasPalette, CanvasPaletteId, CanvasScene } from '@/lib/types'
import { CANVAS_PALETTE_IDS } from '@/lib/types'

export const CANVAS_PALETTES: readonly CanvasPalette[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    colors: { primary: '#22d3ee', secondary: '#818cf8', accent: '#a7f3d0', background: '#071018', text: '#f8fafc' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: { primary: '#fb7185', secondary: '#fbbf24', accent: '#f97316', background: '#180a12', text: '#fff7ed' },
  },
  {
    id: 'mono',
    name: 'Mono',
    colors: { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#ffffff', background: '#050505', text: '#ffffff' },
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: { primary: '#f0abfc', secondary: '#38bdf8', accent: '#fde047', background: '#090418', text: '#faf5ff' },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: { primary: '#4ade80', secondary: '#facc15', accent: '#2dd4bf', background: '#04120c', text: '#f0fdf4' },
  },
  {
    id: 'candy',
    name: 'Candy',
    colors: { primary: '#f472b6', secondary: '#a78bfa', accent: '#67e8f9', background: '#12091c', text: '#fdf4ff' },
  },
]

export const DEFAULT_CANVAS_PALETTE: CanvasPalette = CANVAS_PALETTES[2]

export function isCanvasPaletteId(value: unknown): value is CanvasPaletteId {
  return typeof value === 'string' && (CANVAS_PALETTE_IDS as readonly string[]).includes(value)
}

export function getCanvasPalette(id: CanvasPaletteId | undefined): CanvasPalette {
  return CANVAS_PALETTES.find((palette) => palette.id === id) ?? DEFAULT_CANVAS_PALETTE
}

const TOKEN_PATTERN = /^palette:([a-z]+)$/

function replaceToken(value: string, palette: CanvasPalette): string {
  const match = TOKEN_PATTERN.exec(value)
  if (!match) return value
  const token = match[1] as keyof CanvasPalette['colors']
  return Object.hasOwn(palette.colors, token) ? palette.colors[token] : value
}

function resolveValue(value: unknown, palette: CanvasPalette): unknown {
  if (typeof value === 'string') return replaceToken(value, palette)
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, palette))
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveValue(item, palette)
    return out
  }
  return value
}

/** Return a new scene with every exact `palette:<token>` string replaced by hex. */
export function resolveSceneColors(scene: CanvasScene, palette: CanvasPalette = DEFAULT_CANVAS_PALETTE): CanvasScene {
  return {
    ...scene,
    config: resolveValue(scene.config, palette) as CanvasScene['config'],
  } as CanvasScene
}
