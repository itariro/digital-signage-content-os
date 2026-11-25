import { z } from 'zod'
import { hex, widgetStyleSchema } from '@/lib/widget-style-schema'
import { FRAME_HEIGHT, FRAME_WIDTH, type CanvasState } from '@/lib/types'
import { CATALOG_TYPES, catalogConfigSchema } from '@/lib/canvas/catalog-kit'

const MAX_LOGO_BYTES = 200 * 1024

export function base64Bytes(value: string): number {
  const clean = value.replace(/\s+/g, '')
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - pad
}

const imageDataUri = z
  .string()
  .max(300_000)
  .refine((value) => {
    const match = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value)
    if (!match) return false
    const bytes = base64Bytes(match[2])
    return bytes > 0 && bytes <= MAX_LOGO_BYTES
  }, 'Use a PNG, WebP or JPEG data URI under 200 KB')

const stripSegmentSchema = z.object({
  text: z.string().max(300),
  at: z.number().min(0).max(32000),
  w: z.number().min(0).max(32000),
})

export const marqueeStripSchema = z
  .object({
    lengthPx: z.number().min(1).max(32000),
    crossPx: z.number().min(0).max(32000),
    segments: z.array(stripSegmentSchema).max(400),
  })
  .superRefine((strip, ctx) => {
    let previous = -1
    strip.segments.forEach((segment, index) => {
      if (segment.at < previous) {
        ctx.addIssue({ code: 'custom', message: 'Strip segments must be ordered', path: ['segments', index, 'at'] })
      }
      previous = segment.at
      if (segment.at + segment.w > strip.lengthPx + 0.5) {
        ctx.addIssue({ code: 'custom', message: 'Strip segment overflows lengthPx', path: ['segments', index] })
      }
    })
  })

export const marqueeConfigSchema = z.object({
  lines: z.array(z.string().max(300)).min(1).max(200),
  layout: z.enum(['line', 'block']).default('line'),
  separator: z.string().max(20).default('   •   '),
  direction: z.enum(['left', 'right', 'up', 'down']).default('left'),
  orientation: z.enum(['upright', 'rotated']).default('upright'),
  speed: z.number().min(20).max(4000).default(240),
  repeat: z.boolean().default(true),
  gap: z.number().min(0).max(20000).default(600),
  lineHeight: z.number().min(16).max(1600).default(200),
  fontSize: z.number().min(16).max(1600).default(160),
  align: z.enum(['start', 'center', 'end']).default('center'),
  crossOffset: z.number().min(-4000).max(4000).default(0),
  style: widgetStyleSchema,
  strip: marqueeStripSchema.optional(),
})

const bounceTextLogoSchema = z.object({
  kind: z.literal('text'),
  text: z.string().min(1).max(40),
  shape: z.enum(['none', 'ellipse', 'pill', 'rounded']),
  style: widgetStyleSchema,
  w: z.number().min(16).max(4000),
  h: z.number().min(16).max(4000),
})

const bounceImageLogoSchema = z.object({
  kind: z.literal('image'),
  src: imageDataUri,
  w: z.number().min(16).max(4000),
  h: z.number().min(16).max(4000),
})

export const bounceConfigSchema = z.object({
  logo: z.discriminatedUnion('kind', [bounceTextLogoSchema, bounceImageLogoSchema]),
  speed: z.number().min(40).max(3000).default(280),
  angleDeg: z.number().min(5).max(85).nullable().default(null),
  startMode: z.enum(['seed', 'center']).default('seed'),
  tint: z
    .object({
      mode: z.enum(['cycle', 'fixed', 'none']).default('none'),
      colors: z.array(hex).min(2).max(12).default(['#e11d48', '#f59e0b', '#22c55e', '#3b82f6']),
      fixed: hex.default('#ffffff'),
    })
    .default({ mode: 'none', colors: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6'], fixed: '#ffffff' }),
  cornerCelebration: z.boolean().default(true),
  trail: z
    .object({ enabled: z.boolean().default(false), length: z.number().int().min(0).max(12).default(0), spacingMs: z.number().int().min(16).max(1000).default(80), finish: z.boolean().default(true) })
    .default({ enabled: false, length: 0, spacingMs: 80, finish: true }),
  guaranteedCorner: z.boolean().default(false),
})

export const pongConfigSchema = z.object({
  axis: z.enum(['auto', 'horizontal', 'vertical']).default('auto'),
  paddle: z
    .object({ w: z.number().min(8).max(200), h: z.number().min(20).max(800), inset: z.number().min(0).max(400) })
    .default({ w: 24, h: 220, inset: 40 }),
  ballSize: z.number().min(8).max(200).default(28),
  baseSpeed: z.number().min(100).max(5000).default(900),
  rallyHits: z.tuple([z.number().int().min(1).max(20), z.number().int().min(2).max(21)]),
  pointsPerMatch: z.number().int().min(3).max(21).default(7),
  serveDelayMs: z.number().int().min(0).max(5000).default(900),
  pointPauseMs: z.number().int().min(0).max(5000).default(1200),
  showScore: z.boolean().default(true),
  colors: z
    .object({ ball: hex, paddles: hex, net: hex, text: hex })
    .default({ ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' }),
  scoreStyle: widgetStyleSchema,
}).superRefine((config, ctx) => {
  if (config.rallyHits[1] < config.rallyHits[0] + 1) {
    ctx.addIssue({ code: 'custom', message: 'rallyHits max must be at least min + 1', path: ['rallyHits'] })
  }
})

export const syncTestConfigSchema = z.object({
  periodSec: z.number().min(1).max(60).default(4),
  showGrid: z.boolean().default(true),
  showBezels: z.boolean().default(true),
})

export const canvasSlotSchema = z.object({
  id: z.string().min(1).max(40),
  frameId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).nullable(),
  label: z.string().max(40).optional(),
  offset: z.object({ x: z.number().min(-8000).max(8000), y: z.number().min(-8000).max(8000) }).default({ x: 0, y: 0 }),
  scale: z.number().min(0.25).max(4).default(1),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
})

export const canvasConfigSchema = z
  .object({
    arrangement: z.enum(['row', 'column', 'grid']),
    gridColumns: z.number().int().min(1).max(8).optional(),
    gap: z.number().min(0).max(600).default(0),
    align: z.enum(['start', 'center', 'end']).default('center'),
    slots: z.array(canvasSlotSchema).min(1).max(16),
    background: hex.default('#000000'),
    markers: z.enum(['identify', 'always', 'never']).default('identify'),
    notifications: z.enum(['suppress', 'show']).default('suppress'),
    nightMode: z.enum(['inherit', 'ignore']).default('inherit'),
    maxFps: z.union([z.literal(15), z.literal(24), z.literal(30), z.literal(60)]).default(30),
    bezelMode: z.enum(['show', 'hide', 'collapse']).default('show'),
    unitMode: z.enum(['pixels', 'physical']).default('pixels'),
    screenWidthMm: z.number().min(1).max(4000).optional(),
    screenHeightMm: z.number().min(1).max(4000).optional(),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>()
    const frames = new Set<string>()
    config.slots.forEach((slot, index) => {
      if (ids.has(slot.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate slot id', path: ['slots', index, 'id'] })
      ids.add(slot.id)
      if (slot.frameId) {
        if (frames.has(slot.frameId)) ctx.addIssue({ code: 'custom', message: 'Frame appears twice', path: ['slots', index, 'frameId'] })
        frames.add(slot.frameId)
      }
    })
    if (config.unitMode === 'physical' && (!config.screenWidthMm || !config.screenHeightMm)) {
      ctx.addIssue({ code: 'custom', message: 'Physical units require screen dimensions', path: ['screenWidthMm'] })
    }
  })

const sceneBaseShape = {
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  enabled: z.boolean(),
  durationSec: z.number().min(5).max(86400),
  seed: z.number().int().min(-2147483648).max(2147483647),
}

export const canvasSceneSchema = z.discriminatedUnion('type', [
  z.object({ ...sceneBaseShape, type: z.literal('marquee'), config: marqueeConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('bounce'), config: bounceConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('pong'), config: pongConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('sync-test'), config: syncTestConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.enum(CATALOG_TYPES), config: catalogConfigSchema }),
])

export const deploymentAlbumSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  scenes: z.array(canvasSceneSchema).max(50),
  order: z.enum(['sequence', 'shuffle']),
  crossfadeMs: z.number().int().min(0).max(3000),
})

export const canvasDeploymentSchema = z.object({
  canvasId: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  revision: z.number().int().min(1),
  effectiveAt: z.number(),
  releaseAt: z.number().nullable(),
  slotId: z.string().min(1).max(40),
  config: canvasConfigSchema,
  album: deploymentAlbumSchema.nullable(),
  frameSizes: z.array(z.object({
    id: z.string().min(1).max(64),
    screenWidthMm: z.number().min(1).max(4000).nullable().optional(),
    screenHeightMm: z.number().min(1).max(4000).nullable().optional(),
  })).optional(),
}).superRefine((deployment, ctx) => {
  if (!deployment.config.slots.some((slot) => slot.id === deployment.slotId)) {
    ctx.addIssue({ code: 'custom', message: `Slot ${deployment.slotId} is not in config.slots`, path: ['slotId'] })
  }
})

export const canvasIdentifySchema = z.object({
  until: z.number(),
  canvasName: z.string().max(80),
  frameId: z.string().max(64),
  label: z.string().max(40).nullable(),
  marker: z.number().int().min(1).max(16),
  count: z.number().int().min(1).max(16),
})

/**
 * Task 21 widens `CanvasSceneType` once the registry can render catalog
 * scenes. Until then the parsed value is typed as the existing CanvasState
 * at this single boundary rather than at every consumer.
 */
export const canvasStateSchema: z.ZodType<CanvasState> = z.object({
  v: z.literal(1),
  active: canvasDeploymentSchema.nullable(),
  pending: canvasDeploymentSchema.nullable(),
  identify: canvasIdentifySchema.nullable(),
}) as unknown as z.ZodType<CanvasState>

export const FRAME_CPX = { width: FRAME_WIDTH, height: FRAME_HEIGHT } as const
