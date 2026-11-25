import { z } from 'zod'

export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const gradientDefSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().min(-360).max(720),
  stops: z.array(z.object({ color: hex, position: z.number().min(0).max(100) })).min(2).max(8),
})

const imageFillDefSchema = z.object({
  // Local paths (curated fills, /api/uploads/<name>) or remote http(s) URLs.
  // The URL picker accepts http:// as well as https:// (controls.tsx), so the
  // schema accepts both to keep save from 400ing on a picker-accepted URL.
  url: z.string().min(1).max(600).refine((v) => v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'), 'Invalid image'),
  fit: z.enum(['cover', 'contain', 'repeat']),
  scale: z.number().min(10).max(400),
  position: z.number().min(0).max(100),
})

const textFillSchema = z.union([
  z.object({ kind: z.literal('solid'), color: hex }),
  z.object({ kind: z.literal('gradient'), gradient: gradientDefSchema }),
  z.object({ kind: z.literal('image'), image: imageFillDefSchema }),
])

const textStrokeCfgSchema = z.object({
  enabled: z.boolean(),
  color: hex,
  thickness: z.number().min(0).max(24),
  opacity: z.number().min(0).max(100),
  align: z.enum(['inside', 'outside', 'center']),
})

const lightingShadowSchema = z.object({
  preset: z.enum(['none', 'drop', 'contact', 'long', 'curved']),
  distance: z.number().min(0).max(120),
  blur: z.number().min(0).max(120),
  opacity: z.number().min(0).max(100),
  angle: z.number().min(-360).max(720),
  color: hex,
  steps: z.number().int().min(1).max(200).optional(),
  spread: z.number().min(0).max(80).optional(),
})

export const widgetStyleSchema = z.object({
  fontFamily: z.string().min(1).max(80),
  fontWeight: z.number().int().min(100).max(900),
  letterSpacing: z.number().min(-20).max(60),
  align: z.enum(['start', 'center', 'end']),
  color: hex,
  accent: hex,
  bg: hex,
  bgOpacity: z.number().min(0).max(100),
  blur: z.number().min(0).max(60),
  radius: z.number().min(0).max(1000),
  stroke: hex,
  strokeWidth: z.number().min(0).max(40),
  textStroke: z.number().min(0).max(20),
  opacity: z.number().min(0).max(100),
  shadow: z.boolean(),
  // Text-effect fields (lib/types.ts). Optional so legacy saved styles
  // without them still parse; normalizeWidgetStyle derives them on load.
  fill: textFillSchema.optional(),
  textStrokeCfg: textStrokeCfgSchema.optional(),
  lightingShadow: lightingShadowSchema.optional(),
})
