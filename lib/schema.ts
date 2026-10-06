import { z } from 'zod'
import { ALBUM_THEMES, PRESENTATIONS, WIDGET_TYPES } from './types'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

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
})

export const widgetSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(WIDGET_TYPES),
  template: z.string().min(1).max(40),
  x: z.number().min(-4000).max(6000),
  y: z.number().min(-4000).max(6000),
  w: z.number().min(10).max(4000),
  h: z.number().min(10).max(4000),
  locked: z.boolean(),
  hidden: z.boolean(),
  groupId: z.string().max(40).nullable(),
  style: widgetStyleSchema,
  props: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean()])),
})

export const layoutSettingsSchema = z.object({
  resolution: z.enum(['1080x1920', '1440x2560']),
  background: z
    .string()
    .max(3_000_000)
    .refine((v) => v.startsWith('/') || v.startsWith('https://') || v.startsWith('data:image/') || v === '', 'Invalid background'),
  dim: z.number().min(0).max(90),
  locationName: z.string().max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  units: z.enum(['metric', 'imperial']),
  snap: z.boolean(),
  gridSize: z.number().int().min(4).max(200),
  albumId: z.string().max(40).nullable().default(null),
})

const imageRef = z
  .string()
  .max(600)
  .refine((v) => v.startsWith('/') || v.startsWith('https://'), 'Invalid image')

export const albumItemSchema = z.object({
  id: z.string().min(1).max(40),
  image: imageRef,
  sourceUrl: z.string().max(600),
  title: z.string().max(200),
  subtitle: z.string().max(200),
  year: z.string().max(12),
})

export const slideshowSchema = z.object({
  presentation: z.enum(PRESENTATIONS),
  transition: z.enum(['fade', 'slide', 'zoom', 'none']),
  kenBurns: z.boolean(),
  interval: z.number().int().min(3).max(3600),
  order: z.enum(['sequence', 'shuffle']),
  artSize: z.number().min(30).max(100),
  artPosition: z.enum(['top', 'center', 'bottom']),
  backdrop: z.enum(['blur', 'solid']),
  backdropColor: hex,
})

export const albumCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  theme: z.enum(ALBUM_THEMES),
})

export const albumUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  theme: z.enum(ALBUM_THEMES),
  items: z.array(albumItemSchema).max(200),
  slideshow: slideshowSchema,
})

export const layoutInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  widgets: z.array(widgetSchema).max(60),
  settings: layoutSettingsSchema,
})

export const presetInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  widgets: z.array(widgetSchema).min(1).max(20),
})

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        layoutId: z.string().min(1).max(40),
        days: z.array(z.number().int().min(0).max(6)).max(7),
        start: clock,
        end: clock,
      }),
    )
    .max(24),
  night: z.object({
    enabled: z.boolean(),
    start: clock,
    end: clock,
    brightness: z.number().min(5).max(100),
    warmth: z.number().min(0).max(100),
    hideSeconds: z.boolean(),
  }),
})

export const fontInputSchema = z.object({
  family: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9 ]+$/, 'Use letters, numbers and spaces only'),
})
