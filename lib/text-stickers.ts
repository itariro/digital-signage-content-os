import { nanoid } from 'nanoid'
import type { StickerLayer, Widget, WidgetStyle } from './types'
import { DEFAULT_STYLE } from './widgets'
import { FRAME_WIDTH, FRAME_HEIGHT } from './types'

/** Fixed internal coordinate space every sticker layer is positioned in (spec: 1000×500). */
export const STICKER_SPACE = { w: 1000, h: 500 }

/** Uniform scale-to-fit of the sticker space inside a widget box, centered on both axes. */
export function stickerFit(boxW: number, boxH: number) {
  const scale = Math.min(boxW / STICKER_SPACE.w, boxH / STICKER_SPACE.h)
  return {
    scale,
    offsetX: (boxW - STICKER_SPACE.w * scale) / 2,
    offsetY: (boxH - STICKER_SPACE.h * scale) / 2,
  }
}

function layerStyle(patch: Partial<WidgetStyle>): WidgetStyle {
  return { ...DEFAULT_STYLE, ...patch }
}

function layer(
  id: string,
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  style: Partial<WidgetStyle>,
): StickerLayer {
  return { id, text, ...rect, style: layerStyle(style) }
}

export type TextStickerTemplate = {
  id: string
  name: string
  description: string
  w: number
  h: number
  layers: StickerLayer[]
}

export const BUILTIN_STICKERS: TextStickerTemplate[] = [
  {
    id: 'sticker-hello',
    name: 'Hello headline',
    description: 'Bold two-layer greeting',
    w: 800,
    h: 400,
    layers: [
      layer('l1', 'HELLO', { x: 40, y: 40, w: 920, h: 260 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffffff', accent: '#7cc4ff', shadow: true }),
      layer('l2', 'beautiful day', { x: 80, y: 300, w: 840, h: 160 }, { fontFamily: 'instrument', fontWeight: 400, color: '#7cc4ff', accent: '#7cc4ff', shadow: false }),
    ],
  },
  {
    id: 'sticker-celebrate',
    name: 'Celebrate',
    description: 'Festive layered banner',
    w: 820,
    h: 420,
    layers: [
      layer('l1', 'CELEBRATE', { x: 30, y: 30, w: 940, h: 220 }, { fontFamily: 'outfit', fontWeight: 800, color: '#fff4e6', accent: '#ffb86b', shadow: true }),
      layer('l2', 'good times', { x: 120, y: 250, w: 700, h: 150 }, { fontFamily: 'instrument', fontWeight: 400, color: '#ffb86b', accent: '#ffb86b', shadow: false }),
    ],
  },
  {
    id: 'sticker-love',
    name: 'Love note',
    description: 'Soft two-layer caption',
    w: 760,
    h: 380,
    layers: [
      layer('l1', 'love', { x: 60, y: 60, w: 640, h: 220 }, { fontFamily: 'playfair', fontWeight: 700, color: '#fff1f4', accent: '#ff8fa3', shadow: true }),
      layer('l2', 'is in the details', { x: 120, y: 280, w: 520, h: 100 }, { fontFamily: 'inter', fontWeight: 400, color: '#ffc7d2', accent: '#ff8fa3', shadow: false }),
    ],
  },
  {
    id: 'sticker-retro',
    name: 'Retro badge',
    description: 'Outlined dimensional text',
    w: 700,
    h: 420,
    layers: [
      layer('l1', 'RETRO', { x: 40, y: 40, w: 620, h: 240 }, { fontFamily: 'bebas', fontWeight: 400, color: '#f3ecd2', accent: '#ffd36e', textStroke: 3, stroke: '#0b0c10', shadow: true }),
      layer('l2', 'VIBES', { x: 120, y: 280, w: 460, h: 120 }, { fontFamily: 'grotesk', fontWeight: 700, color: '#ffd36e', accent: '#ffd36e', shadow: false }),
    ],
  },
  {
    id: 'sticker-minimal',
    name: 'Minimal',
    description: 'Clean modern label',
    w: 720,
    h: 260,
    layers: [
      layer('l1', 'minimal', { x: 40, y: 40, w: 640, h: 180 }, { fontFamily: 'inter', fontWeight: 300, color: '#ffffff', accent: '#7cc4ff', shadow: false, bgOpacity: 0 }),
    ],
  },
  {
    id: 'sticker-banner',
    name: 'Banner',
    description: 'Ribbon-style caption',
    w: 900,
    h: 260,
    layers: [
      layer('l1', 'SPECIAL', { x: 40, y: 40, w: 820, h: 180 }, { fontFamily: 'outfit', fontWeight: 700, color: '#0b0c10', accent: '#0b0c10', bg: '#7cc4ff', bgOpacity: 100, radius: 24, shadow: true }),
    ],
  },
  {
    id: 'sticker-three',
    name: 'Three layer',
    description: 'Headline with subtitle and tag',
    w: 860,
    h: 440,
    layers: [
      layer('l1', 'BIG NEWS', { x: 40, y: 30, w: 780, h: 220 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffffff', accent: '#ff8fa3', shadow: true }),
      layer('l2', 'something happened today', { x: 60, y: 250, w: 740, h: 120 }, { fontFamily: 'inter', fontWeight: 400, color: '#ff8fa3', accent: '#ff8fa3', shadow: false }),
      layer('l3', 'READ MORE', { x: 60, y: 370, w: 320, h: 70 }, { fontFamily: 'grotesk', fontWeight: 700, color: '#0b0c10', accent: '#0b0c10', bg: '#ff8fa3', bgOpacity: 100, radius: 16, shadow: false }),
    ],
  },
  {
    id: 'sticker-thanks',
    name: 'Thank you',
    description: 'Warm two-line gratitude',
    w: 800,
    h: 400,
    layers: [
      layer('l1', 'THANK', { x: 60, y: 40, w: 880, h: 240 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffffff', accent: '#9be7c4', shadow: true }),
      layer('l2', 'you so much', { x: 120, y: 290, w: 760, h: 150 }, { fontFamily: 'instrument', fontWeight: 400, color: '#9be7c4', accent: '#9be7c4', shadow: false }),
    ],
  },
  {
    id: 'sticker-sale',
    name: 'Big sale',
    description: 'High-impact price flag',
    w: 900,
    h: 300,
    layers: [
      layer('l1', 'SALE', { x: 40, y: 30, w: 500, h: 240 }, { fontFamily: 'outfit', fontWeight: 800, color: '#0b0c10', accent: '#0b0c10', shadow: false }),
      layer('l2', 'up to 50% off', { x: 540, y: 90, w: 420, h: 130 }, { fontFamily: 'grotesk', fontWeight: 500, color: '#ffd36e', accent: '#ffd36e', bg: '#0b0c10', bgOpacity: 100, radius: 20, shadow: false }),
    ],
  },
  {
    id: 'sticker-morning',
    name: 'Good morning',
    description: 'Soft sunrise greeting',
    w: 760,
    h: 380,
    layers: [
      layer('l1', 'good', { x: 60, y: 50, w: 400, h: 180 }, { fontFamily: 'playfair', fontWeight: 700, color: '#fff4e6', accent: '#ffb86b', shadow: true }),
      layer('l2', 'MORNING', { x: 60, y: 240, w: 880, h: 200 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffb86b', accent: '#ffb86b', shadow: false }),
    ],
  },
  {
    id: 'sticker-note',
    name: 'Sticky note',
    description: 'Paper card reminder',
    w: 700,
    h: 350,
    layers: [
      layer('l1', "don't\nforget", { x: 60, y: 40, w: 580, h: 300 }, { fontFamily: 'grotesk', fontWeight: 700, color: '#0b0c10', accent: '#0b0c10', bg: '#ffd36e', bgOpacity: 100, radius: 28, align: 'start', shadow: true }),
    ],
  },
  {
    id: 'sticker-movie',
    name: 'Movie night',
    description: 'Cinematic headline pair',
    w: 860,
    h: 430,
    layers: [
      layer('l1', 'MOVIE', { x: 40, y: 40, w: 920, h: 250 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffffff', accent: '#3a5bd9', textStroke: 2, stroke: '#0b0c10', shadow: true }),
      layer('l2', 'tonight', { x: 240, y: 300, w: 520, h: 140 }, { fontFamily: 'instrument', fontWeight: 400, color: '#3a5bd9', accent: '#3a5bd9', shadow: false }),
    ],
  },
  {
    id: 'sticker-hydrate',
    name: 'Hydrate',
    description: 'Bold wellness nudge',
    w: 720,
    h: 260,
    layers: [
      layer('l1', 'DRINK WATER', { x: 40, y: 40, w: 920, h: 180 }, { fontFamily: 'outfit', fontWeight: 800, color: '#f1fff8', accent: '#9be7c4', bg: '#0a2018', bgOpacity: 100, radius: 90, shadow: false }),
    ],
  },
  {
    id: 'sticker-milestone',
    name: 'Milestone',
    description: 'Celebratory number flag',
    w: 820,
    h: 410,
    layers: [
      layer('l1', '100', { x: 60, y: 30, w: 560, h: 320 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffd36e', accent: '#ffd36e', shadow: true }),
      layer('l2', 'DAYS', { x: 620, y: 130, w: 340, h: 150 }, { fontFamily: 'grotesk', fontWeight: 700, color: '#ffffff', accent: '#ffffff', shadow: false }),
      layer('l3', 'of school!', { x: 620, y: 280, w: 340, h: 110 }, { fontFamily: 'instrument', fontWeight: 400, color: '#ff8fa3', accent: '#ff8fa3', shadow: false }),
    ],
  },
  {
    id: 'sticker-birthday',
    name: 'Birthday',
    description: 'Fancy cake-day banner',
    w: 900,
    h: 300,
    layers: [
      layer('l1', 'HAPPY', { x: 40, y: 40, w: 440, h: 200 }, { fontFamily: 'playfair', fontWeight: 800, color: '#fff1f4', accent: '#ff8fa3', shadow: true }),
      layer('l2', 'BIRTHDAY', { x: 480, y: 40, w: 480, h: 200 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ff8fa3', accent: '#ff8fa3', shadow: true }),
    ],
  },
  {
    id: 'sticker-focus',
    name: 'Deep work',
    description: 'Do-not-disturb stack',
    w: 860,
    h: 430,
    layers: [
      layer('l1', 'DEEP WORK', { x: 40, y: 40, w: 920, h: 220 }, { fontFamily: 'bebas', fontWeight: 400, color: '#ffffff', accent: '#7cc4ff', shadow: true }),
      layer('l2', 'in progress...', { x: 140, y: 270, w: 720, h: 110 }, { fontFamily: 'inter', fontWeight: 300, color: '#7cc4ff', accent: '#7cc4ff', shadow: false }),
      layer('l3', 'DO NOT DISTURB', { x: 140, y: 390, w: 720, h: 80 }, { fontFamily: 'grotesk', fontWeight: 700, color: '#0b0c10', accent: '#0b0c10', bg: '#7cc4ff', bgOpacity: 100, radius: 14, shadow: false }),
    ],
  },
  {
    id: 'sticker-welcome',
    name: 'Welcome sign',
    description: 'Elegant entrance plate',
    w: 760,
    h: 380,
    layers: [
      layer('l1', 'welcome', { x: 80, y: 60, w: 840, h: 220 }, { fontFamily: 'playfair', fontWeight: 500, color: '#ffffff', accent: '#ffffff', shadow: true }),
      layer('l2', 'home', { x: 380, y: 300, w: 240, h: 120 }, { fontFamily: 'instrument', fontWeight: 400, color: '#c9f5e0', accent: '#9be7c4', shadow: false }),
    ],
  },
]

export function createStickerWidget(template: TextStickerTemplate, center?: { x: number; y: number }): Widget {
  const cx = center?.x ?? FRAME_WIDTH / 2
  const cy = center?.y ?? FRAME_HEIGHT / 2
  return {
    id: nanoid(10),
    type: 'sticker',
    template: 'default',
    x: Math.round(cx - template.w / 2),
    y: Math.round(cy - template.h / 2),
    w: template.w,
    h: template.h,
    locked: false,
    hidden: false,
    groupId: null,
    style: { ...DEFAULT_STYLE, bgOpacity: 0, shadow: false },
    props: {},
    layers: structuredClone(template.layers).map((l) => ({ ...l, id: nanoid(8) })),
  }
}
