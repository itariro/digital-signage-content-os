import { z } from 'zod'
import { WIDGET_TYPES } from './types'

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

export const fontInputSchema = z.object({
  family: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Za-z0-9 ]+$/, 'Use letters, numbers and spaces only'),
})
