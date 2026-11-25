import { z } from 'zod'
import { clamp } from '@/lib/canvas/math'
import { gameStateAt, type GameStep } from '@/lib/canvas/games'
import { hash01 } from '@/lib/mosaic'

export type CatalogContext = {
  bounds: { width: number; height: number }
  geometry: { width: number; height: number }
  tMs: number
  seed: number
}

export const CATALOG_TYPES = [
  'panorama',
  'gallery-wall',
  'exhibit',
  'mosaic-wall',
  'tile-reveal',
  'kinetic-type',
  'split-flap',
  'multi-lane-marquee',
  'wall-clock',
  'countdown',
  'gradient-flow',
  'color-field',
  'light-sweep',
  'ripples',
  'metaballs',
  'lissajous',
  'flow-lines',
  'moire',
  'starfield',
  'matrix-rain',
  'fireworks',
  'bouncing-balls',
  'chase-lights',
  'breakout',
  'snake',
  'sprite-parade',
  'life',
  'calibration',
] as const

export type CatalogSceneType = (typeof CATALOG_TYPES)[number]

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const catalogColor = z.union([hex, z.string().regex(/^palette:(primary|secondary|accent|background|text)$/)])
const assetRef = z.string().regex(/^canvas-asset:[a-f0-9]{64}$/)

export const catalogConfigSchema = z.object({
  text: z.string().max(200).optional(),
  lines: z.array(z.string().max(120)).max(12).optional(),
  images: z.array(assetRef).max(40).optional(),
  colors: z.array(catalogColor).max(12).optional(),
  speed: z.number().min(0).max(4000).optional(),
  density: z.number().min(1).max(400).optional(),
  scale: z.number().min(0.1).max(10).optional(),
  cols: z.number().int().min(1).max(40).optional(),
  rows: z.number().int().min(1).max(40).optional(),
  gap: z.number().min(0).max(2000).optional(),
  size: z.number().min(4).max(600).optional(),
  angle: z.number().min(-360).max(360).optional(),
  periodSec: z.number().min(0.5).max(3600).optional(),
  fontFamily: z.string().max(40).optional(),
  fontSize: z.number().min(8).max(500).optional(),
  epochMs: z.number().min(0).max(8.64e15).optional(),
  remainingMs: z.number().min(0).max(8.64e15).optional(),
  tileMs: z.number().min(100).max(60000).optional(),
  reversed: z.boolean().optional(),
  trail: z.boolean().optional(),
  opacity: z.number().min(0.05).max(1).optional(),
}).strict()

export type CatalogSceneConfig = z.infer<typeof catalogConfigSchema>

export const CATALOG_DEFAULT_COLORS = ['#7cc4ff', '#e879f9', '#facc15', '#22c55e', '#f97316', '#ffffff']

export type CatalogCell = {
  id: string
  x: number
  y: number
  w: number
  h: number
  value: number
  color?: string
  text?: string
  image?: string
}

export type CatalogGameState = {
  x: number
  y: number
  vx: number
  vy: number
  score: number
  stage: number
  cells: number[]
}

export type CatalogState = {
  tMs: number
  cycleMs: number
  phase: number
  values: number[]
  cells: CatalogCell[]
  texts: string[]
  images: string[]
  game?: GameStep<CatalogGameState>
}

export type CatalogSceneRenderState = {
  type: CatalogSceneType
  config: CatalogSceneConfig
  state: CatalogState
}

export function configNumber(
  config: CatalogSceneConfig,
  key: keyof CatalogSceneConfig,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = config[key]
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

export function configText(config: CatalogSceneConfig, key: 'text' | 'fontFamily', fallback: string, max: number): string {
  const value = config[key]
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : fallback
}

export function configLines(config: CatalogSceneConfig, fallback: string[]): string[] {
  return Array.isArray(config.lines) && config.lines.length > 0 ? config.lines.slice(0, 12) : fallback
}

export function configColors(config: CatalogSceneConfig): string[] {
  return Array.isArray(config.colors) && config.colors.length > 0 ? config.colors.slice(0, 12) : CATALOG_DEFAULT_COLORS
}

export function configImages(config: CatalogSceneConfig): string[] {
  return Array.isArray(config.images) ? config.images.slice(0, 40) : []
}

export function baseState(config: CatalogSceneConfig, ctx: CatalogContext, cycleMs: number): CatalogState {
  const safeCycle = Math.max(1, cycleMs)
  return {
    tMs: Math.max(0, ctx.tMs),
    cycleMs: safeCycle,
    phase: (Math.max(0, ctx.tMs) % safeCycle) / safeCycle,
    values: [],
    cells: [],
    texts: [],
    images: configImages(config),
  }
}

export function wave01(seed: number, k: number, index: number): number {
  return hash01(seed | 0, Math.imul(k + 1, 7919) + Math.imul(index + 1, 104729))
}

/**
 * Build at most 32 deterministic cells across the whole wall. Every catalog
 * renderer uses this cap so one frame never creates more than 40 DOM/canvas
 * elements, including its background and labels.
 */
export function gridCells(ctx: CatalogContext, cols: number, rows: number, gap: number): CatalogCell[] {
  let safeCols = Math.max(1, Math.round(cols))
  let safeRows = Math.max(1, Math.round(rows))
  while (safeCols * safeRows > 32) {
    if (safeCols >= safeRows) safeCols -= 1
    else safeRows -= 1
  }
  const count = safeCols * safeRows
  const cellW = ctx.bounds.width / safeCols
  const cellH = ctx.bounds.height / safeRows
  const cells: CatalogCell[] = []
  for (let index = 0; index < count; index += 1) {
    const col = index % safeCols
    const row = Math.floor(index / safeCols)
    cells.push({
      id: `${col}:${row}`,
      x: col * cellW + gap / 2,
      y: row * cellH + gap / 2,
      w: Math.max(0, cellW - gap),
      h: Math.max(0, cellH - gap),
      value: wave01(ctx.seed, index, 0),
    })
  }
  return cells
}

export function catalogGame(
  config: CatalogSceneConfig,
  ctx: CatalogContext,
  name: string,
  initial: (seed: number, round: number) => CatalogGameState,
  step: (state: CatalogGameState, tick: number, random: () => number) => CatalogGameState,
): GameStep<CatalogGameState> {
  const fps = configNumber(config, 'speed', 30, 1, 120)
  return gameStateAt<CatalogGameState>({
    key: `${name}:${ctx.seed}:${JSON.stringify(config)}:${ctx.bounds.width}x${ctx.bounds.height}`,
    seed: ctx.seed,
    stepMs: Math.round(1000 / fps),
    tMs: ctx.tMs,
    initial,
    step,
  })
}
